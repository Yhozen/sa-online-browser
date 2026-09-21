// SPDX-License-Identifier: GPL-3.0-or-later
// Directional codecs reference the pinned open.mp Shared/NetCode schemas.
#include <RakClient.h>
#include <PacketEnumerations.h>
#include <BitStream.h>
#include <GetTime.h>
#include <json.hpp>
#include <iostream>
#include <array>
#include <chrono>
#include <cmath>
#include <unistd.h>
#include <fcntl.h>
#include <csignal>
#include <random>
#include <sstream>
#include <type_traits>
#include <cerrno>
#include <charconv>
#include <vector>
using namespace RakNet;
using json=nlohmann::json;
using Vec=std::array<float,3>;
using Quat=std::array<float,4>;
static RakClient client;
static bool running=true,spawned=false,seatPending=false;
static volatile std::sig_atomic_t stopRequested=0;
static uint64_t sequence=0,controlRevision=0;
static Vec position={0,0,10};
static float heading=0;
static json state={{"mode","onFoot"},{"position",position},{"rotation",{1,0,0,0}},{"velocity",{0,0,0}},{"keys",0}};
void emit(json event){
 const auto type=event.value("type","");
 if(type=="spawn"||type=="selfPosition"||type=="selfHeading"||type=="seat"||type=="exitVehicle")++controlRevision;
 event["controlRevision"]=controlRevision;event["seq"]=++sequence;std::cout<<event.dump(-1,' ',false,json::error_handler_t::replace)<<std::endl;if(!std::cout)running=false;}
struct Reader {
 BitStream b;
 Reader(unsigned char* data,unsigned bytes,unsigned bits=0):b(data,bytes,false){if(bytes>65536||(bytes&&!data)||bits>bytes*8)throw std::runtime_error("invalid payload bounds");if(bits)b.SetWriteOffset(bits);}
 template<class T> T get(){T v{};if(!b.Read(v))throw std::runtime_error("truncated payload");if constexpr(std::is_floating_point_v<T>)if(!std::isfinite(v))throw std::runtime_error("non-finite payload value");return v;}
 void skip(unsigned bits){if(b.GetNumberOfUnreadBits()<bits)throw std::runtime_error("truncated payload");b.IgnoreBits(bits);}
 Vec vec(){Vec p;for(auto&f:p){f=get<float>();if(!std::isfinite(f))throw std::runtime_error("invalid vector");}return p;}
 Quat quat(){Quat q{};if(b.GetNumberOfUnreadBits()<52)throw std::runtime_error("truncated quaternion");if(!b.ReadNormQuat(q[0],q[1],q[2],q[3]))throw std::runtime_error("truncated quaternion");float norm=0;for(auto f:q)norm+=f*f;if(!std::isfinite(norm)||fabs(norm-1.f)>.001f)throw std::runtime_error("invalid quaternion");return q;}
 Vec velocity(){Vec v{0,0,0};float magnitude=get<float>();if(!std::isfinite(magnitude)||magnitude<0||magnitude>100)throw std::runtime_error("invalid velocity");if(magnitude>0.00001f)for(auto&f:v){if(!b.ReadCompressed(f))throw std::runtime_error("truncated velocity");f*=magnitude;}return v;}
 std::string string(unsigned n){if(n>4096||b.GetNumberOfUnreadBits()<n*8)throw std::runtime_error("invalid string length");std::string s(n,' ');if(n&&!b.Read(s.data(),n))throw std::runtime_error("truncated string");return s;}
 std::string str8(){return string(get<uint8_t>());}
};
void rpc(int id,BitStream& b){client.RPC(id,&b,HIGH_PRIORITY,RELIABLE_ORDERED,0,false,UNASSIGNED_NETWORK_ID,nullptr);}
void rpc(int id){BitStream b;rpc(id,b);}
void writeVec(BitStream&b,Vec v){for(float f:v)b.Write(f);}
void writeQuat(BitStream&b,Quat q){for(float f:q)b.Write(f);}
void str8(BitStream&b,const std::string&s){b.Write(uint8_t(s.size()));b.Write(s.data(),s.size());}
void syncState(){
 if(!spawned||seatPending)return;
 BitStream b;auto mode=state.value("mode","onFoot");auto p=state.at("position").get<Vec>();auto q=state.at("rotation").get<Quat>();auto v=state.at("velocity").get<Vec>();uint16_t keys=state.value("keys",0);
 if(mode=="driver"){
  b.Write(uint8_t(200));b.Write(uint16_t(state.value("vehicleId",1)));b.Write(uint16_t(0));b.Write(uint16_t(0));b.Write(keys);writeQuat(b,q);writeVec(b,p);writeVec(b,v);b.Write(1000.f);b.Write(uint8_t(100));b.Write(uint8_t(0));b.Write(uint8_t(0));b.Write(uint8_t(0));b.Write(uint8_t(0));b.Write(uint16_t(0));b.Write(uint32_t(0));
 }else if(mode=="passenger"){
  b.Write(uint8_t(211));b.Write(uint16_t(state.value("vehicleId",1)));b.Write(uint16_t(state.value("seat",1)));b.Write(uint8_t(100));b.Write(uint8_t(0));b.Write(uint16_t(0));b.Write(uint16_t(0));b.Write(keys);writeVec(b,p);
 }else{
  b.Write(uint8_t(207));b.Write(uint16_t(0));b.Write(uint16_t(0));b.Write(keys);writeVec(b,p);writeQuat(b,q);b.Write(uint8_t(100));b.Write(uint8_t(0));b.Write(uint8_t(0));b.Write(uint8_t(0));writeVec(b,v);writeVec(b,{0,0,0});b.Write(uint16_t(0));b.Write(uint16_t(0));b.Write(uint16_t(0));
 }
 client.Send(&b,HIGH_PRIORITY,UNRELIABLE_SEQUENCED,0);
}
static uint32_t footRate=30,carRate=30;
// These fixture notices are carried by ordinary reliable server ClientMessage
// RPCs. Player chat RPC 101 never enters this parser and cannot award a result.
std::vector<std::string> noticeFields(const std::string&text,const std::string&prefix){
 if(text.size()>144)throw std::runtime_error("oversized challenge notice");
 std::vector<std::string> fields;std::istringstream stream(text.substr(prefix.size()));std::string field;
 while(stream>>field){if(fields.size()>=16)throw std::runtime_error("too many challenge fields");fields.push_back(field);}return fields;
}
int64_t noticeInteger(const std::string&field,int64_t minimum,int64_t maximum){
 int64_t value=0;const auto parsed=std::from_chars(field.data(),field.data()+field.size(),value);
 if(parsed.ec!=std::errc{}||parsed.ptr!=field.data()+field.size()||value<minimum||value>maximum)throw std::runtime_error("invalid challenge integer");return value;
}
void noticeName(const std::string&name){
 if(name.empty()||name.size()>24)throw std::runtime_error("invalid score name");
 for(unsigned char c:name)if(!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='_'||c=='['||c==']'||c=='('||c==')'||c=='$'||c=='@'||c=='.'||c=='='||c=='-'))throw std::runtime_error("invalid score name");
}
bool challengeNotice(const std::string&text){
 const std::string statePrefix="ARROYO_RACE_V1 ",clearPrefix="ARROYO_SCORES_V1 ",scorePrefix="ARROYO_SCORE_V1 ";
 if(text.rfind(statePrefix,0)==0){
  auto fields=noticeFields(text,statePrefix);if(fields.size()!=12)throw std::runtime_error("invalid challenge field count");
  const char* phases[]={"idle","countdown","running","finished","cancelled"};
  const char* reasons[]={"none","driver_exit","passenger_exit","driver_disconnect","passenger_disconnect","reset","cancelled","left_start","timeout","teleport","seat_change"};
  auto generation=noticeInteger(fields[0],0,1000000000),phase=noticeInteger(fields[1],0,4),driver=noticeInteger(fields[2],0,65535),passenger=noticeInteger(fields[3],0,65535),vehicle=noticeInteger(fields[4],0,1999),index=noticeInteger(fields[5],0,64),count=noticeInteger(fields[6],1,64),elapsed=noticeInteger(fields[7],0,3600000),countdown=noticeInteger(fields[8],0,60000),best=noticeInteger(fields[9],0,3600000),tick=noticeInteger(fields[10],INT32_MIN,INT32_MAX),reason=noticeInteger(fields[11],0,10);
  if((driver>=1000&&driver!=65535)||(passenger>=1000&&passenger!=65535)||index>count||(phase==3&&index!=count)||((phase==1||phase==2)&&index>=count)||((phase==1||phase==2||phase==3)&&(driver==65535||vehicle==0))||((phase!=1)&&countdown!=0)||(passenger==driver&&driver!=65535)||((phase==1)&&elapsed!=0)||((phase==3)&&elapsed==0)||((phase!=4)&&reason!=0)||((phase==4)&&reason==0)||((phase==0)&&(generation!=0||driver!=65535||passenger!=65535||index!=0||elapsed!=0))||((phase!=0)&&generation==0))throw std::runtime_error("inconsistent challenge state");
  emit({{"type","challenge"},{"version",1},{"generation",generation},{"phase",phases[phase]},{"driverId",driver},{"passengerId",passenger},{"vehicleId",vehicle},{"checkpointIndex",index},{"checkpointCount",count},{"elapsedMs",elapsed},{"countdownMs",countdown},{"bestMs",best},{"serverTick",tick},{"reason",reasons[reason]}});return true;
 }
 if(text.rfind(clearPrefix,0)==0){auto fields=noticeFields(text,clearPrefix);if(fields.size()!=2)throw std::runtime_error("invalid score reset field count");emit({{"type","challengeScoresClear"},{"generation",noticeInteger(fields[0],0,1000000000)},{"count",noticeInteger(fields[1],0,5)}});return true;}
 if(text.rfind(scorePrefix,0)==0){auto fields=noticeFields(text,scorePrefix);if(fields.size()!=5)throw std::runtime_error("invalid score field count");noticeName(fields[3]);noticeName(fields[4]);emit({{"type","challengeScore"},{"generation",noticeInteger(fields[0],0,1000000000)},{"rank",noticeInteger(fields[1],1,5)},{"timeMs",noticeInteger(fields[2],1,3600000)},{"driverName",fields[3]},{"passengerName",fields[4]=="-"?"":fields[4]}});return true;}
 // A typo or unsupported version is visible as ordinary server text.
 return false;
}
void onRpc(RPCParameters*params,void*extra){
 auto id=int(reinterpret_cast<intptr_t>(extra));std::cerr<<"RPC "<<id<<" bits "<<params->numberOfBitsOfData<<"\n";
 try{
 Reader r(params->input,(params->numberOfBitsOfData+7)/8,params->numberOfBitsOfData);
 switch(id){
 case 139:{
  r.skip(104);auto playerId=r.get<uint16_t>();r.skip(115);auto foot=r.get<uint32_t>();auto car=r.get<uint32_t>();r.skip(96);r.str8();r.skip(212*8+32);if(playerId>=1000)throw std::runtime_error("invalid player id");footRate=foot;carRate=car;
  emit({{"type","init"},{"playerId",playerId},{"onFootRate",footRate},{"inCarRate",carRate}});
  BitStream b;b.Write(uint16_t(0));rpc(128,b);break;
 }
 case 128:case 68:{
  if(id==128)r.get<uint8_t>();r.skip(48);auto spawn=r.vec();auto angle=r.get<float>();r.skip(192);position=spawn;heading=angle;state["position"]=position;state["rotation"]=Quat{float(cos(heading*M_PI/360)),0,0,float(-sin(heading*M_PI/360))};
  if(id==128)rpc(129);break;
 }
 case 129:{auto allow=r.get<uint32_t>();if(allow==1||allow==2){rpc(52);spawned=true;emit({{"type","spawn"},{"position",position},{"heading",heading}});syncState();}else emit({{"type","error"},{"message","Spawn rejected"}});break;}
 case 137:{auto id=r.get<uint16_t>();r.skip(40);auto name=r.str8();emit({{"type","playerJoin"},{"id",id},{"name",name}});break;}
 case 138:case 163:{auto id=r.get<uint16_t>();if(reinterpret_cast<intptr_t>(extra)==138)r.skip(8);emit({{"type","playerRemove"},{"id",id}});break;}
 case 32:{auto id=r.get<uint16_t>();r.skip(40);auto p=r.vec();auto h=r.get<float>();r.skip(216);emit({{"type","playerState"},{"id",id},{"position",p},{"rotation",{cos(h*M_PI/360),0,0,-sin(h*M_PI/360)}},{"velocity",{0,0,0}},{"mode","onFoot"}});break;}
 case 101:{auto id=r.get<uint16_t>();auto text=r.str8();emit({{"type","chat"},{"id",id},{"text",text}});break;}
 case 93:{r.skip(32);auto text=r.string(r.get<uint32_t>());if(!challengeNotice(text))emit({{"type","message"},{"text",text}});break;}
 case 38:{if(params->numberOfBitsOfData!=232)throw std::runtime_error("invalid race checkpoint length");auto kind=r.get<uint8_t>();auto p=r.vec();auto next=r.vec();auto radius=r.get<float>();if(kind>8||radius<=0||radius>1000)throw std::runtime_error("invalid race checkpoint");for(auto v:p)if(fabs(v)>20000)throw std::runtime_error("invalid checkpoint position");for(auto v:next)if(fabs(v)>20000)throw std::runtime_error("invalid next checkpoint position");emit({{"type","raceCheckpoint"},{"checkpointType",kind},{"position",p},{"nextPosition",next},{"radius",radius}});break;}
 case 39:{if(params->numberOfBitsOfData!=0)throw std::runtime_error("invalid checkpoint disable length");emit({{"type","raceCheckpointClear"}});break;}
 case 12:case 13:{position=r.vec();state["position"]=position;emit({{"type","selfPosition"},{"position",position}});break;}
 case 19:{heading=r.get<float>();state["rotation"]=Quat{float(cos(heading*M_PI/360)),0,0,float(-sin(heading*M_PI/360))};emit({{"type","selfHeading"},{"heading",heading}});break;}
 case 164:{auto id=r.get<uint16_t>();auto model=r.get<uint32_t>();auto p=r.vec();auto h=r.get<float>();r.skip(328);emit({{"type","vehicle"},{"id",id},{"model",model},{"position",p},{"heading",h}});break;}
 case 165:emit({{"type","vehicleRemove"},{"id",r.get<uint16_t>()}});break;
 case 159:{auto id=r.get<uint16_t>();auto p=r.vec();if(state.value("mode","onFoot")!="onFoot"&&state.value("vehicleId",0)==id){++controlRevision;state["position"]=p;state["velocity"]=Vec{0,0,0};}emit({{"type","vehicleState"},{"id",id},{"position",p}});break;}
 case 160:{auto id=r.get<uint16_t>();auto h=r.get<float>();Quat q{float(cos(h*M_PI/360)),0,0,float(-sin(h*M_PI/360))};if(state.value("mode","onFoot")!="onFoot"&&state.value("vehicleId",0)==id){++controlRevision;state["rotation"]=q;}emit({{"type","vehicleState"},{"id",id},{"heading",h},{"rotation",q}});break;}
 case 70:{auto id=r.get<uint16_t>();auto seat=r.get<uint8_t>();if(id==0||id>=2000||seat>7)throw std::runtime_error("invalid seat placement");seatPending=true;state["mode"]=seat==0?"driver":"passenger";state["vehicleId"]=id;state["seat"]=seat;emit({{"type","seat"},{"vehicleId",id},{"seat",seat}});break;}
 case 71:{seatPending=false;BitStream b;b.Write(uint16_t(state.value("vehicleId",1)));rpc(154,b);state["mode"]="onFoot";emit({{"type","exitVehicle"}});syncState();break;}
 case 130:emit({{"type","error"},{"message","Server rejected join (reason "+std::to_string(r.get<uint8_t>())+")"}});running=false;break;
 default:break;
 }
 }catch(const std::exception&e){emit({{"type","error"},{"message","Malformed server RPC "+std::to_string(id)+": "+e.what()}});if(id==139||id==128||id==129||id==70||id==71)running=false;}
}
void onSync(Packet*p){
 try{
 Reader r(p->data,p->length,p->bitSize);int kind=r.get<uint8_t>();auto id=r.get<uint16_t>();Vec pos,vel{0,0,0};Quat q{1,0,0,0};uint16_t vehicle=0,keys=0;int seat=-1;std::string mode;
 if(kind==207){if(r.get<bool>())r.skip(16);if(r.get<bool>())r.skip(16);keys=r.get<uint16_t>();pos=r.vec();q=r.quat();r.skip(24);vel=r.velocity();if(r.get<bool>()){r.skip(16);r.vec();}if(r.get<bool>())r.skip(32);mode="onFoot";}
 else if(kind==200){vehicle=r.get<uint16_t>();r.skip(32);keys=r.get<uint16_t>();q=r.quat();pos=r.vec();vel=r.velocity();r.skip(32);r.skip(2);if(r.get<bool>())r.skip(32);if(r.get<bool>())r.skip(16);seat=0;mode="driver";}
 else if(kind==211){vehicle=r.get<uint16_t>();seat=r.get<uint16_t>()&63;r.skip(48);keys=r.get<uint16_t>();pos=r.vec();mode="passenger";}
 else return;
 if(id>=1000||(mode!="onFoot"&&(vehicle==0||vehicle>=2000||seat>7)))throw std::runtime_error("invalid synchronization identity");
 emit({{"type","playerState"},{"id",id},{"position",pos},{"rotation",q},{"velocity",vel},{"mode",mode},{"vehicleId",vehicle},{"seat",seat},{"keys",keys}});
 if(kind==200)emit({{"type","vehicleState"},{"id",vehicle},{"position",pos},{"rotation",q},{"velocity",vel}});
 }catch(const std::exception&e){std::cerr<<"decode sync: "<<e.what()<<'\n';}
}
void input(const std::string&line){
 try{auto j=json::parse(line);std::string type=j.at("type");
 if(type=="disconnect"){running=false;return;}
 if(type=="state"){
  for(const auto&field:{"keys","vehicleId","seat"})if(j.contains(field)&&!j[field].is_number_integer())throw std::runtime_error("state indexes must be integers");
  for(const auto&field:{"position","velocity","rotation"})if(!j.at(field).is_array()||j.at(field).size()!=(std::string(field)=="rotation"?4u:3u))throw std::runtime_error("state vector has wrong length");
  auto p=j.at("position").get<Vec>();auto q=j.at("rotation").get<Quat>();auto v=j.at("velocity").get<Vec>();
  for(auto f:p)if(!std::isfinite(f)||fabs(f)>20000)throw std::runtime_error("invalid position");
  float speedSquared=0;for(auto f:v){if(!std::isfinite(f))throw std::runtime_error("invalid velocity");speedSquared+=f*f;}if(speedSquared>10000)throw std::runtime_error("invalid velocity");
  float norm=0;for(auto f:q){if(!std::isfinite(f))throw std::runtime_error("invalid rotation");norm+=f*f;}
  if(fabs(norm-1.f)>.001f)throw std::runtime_error("invalid rotation");
  auto mode=j.value("mode","onFoot");if(mode!="onFoot"&&mode!="driver"&&mode!="passenger")throw std::runtime_error("invalid mode");
  if(j.value("vehicleId",0)<0||j.value("vehicleId",0)>1999||j.value("seat",0)<-1||j.value("seat",0)>7||j.value("keys",0)<0||j.value("keys",0)>65535)throw std::runtime_error("invalid state index");
  if(!j.contains("controlRevision")||!j["controlRevision"].is_number_unsigned()||j["controlRevision"].get<uint64_t>()!=controlRevision)return;
  // Seat transitions belong to server RPCs; discard stale browser snapshots.
  if(mode!=state.value("mode","onFoot"))return;
  if(mode!="onFoot"&&(j.value("vehicleId",0)!=state.value("vehicleId",0)||j.value("seat",-1)!=state.value("seat",-1)))return;
  state=j;seatPending=false;
 }else if(type=="chat"||type=="command"){
  auto text=j.at("text").get<std::string>();if(text.empty()||text.size()>144)throw std::runtime_error("text must be 1..144 bytes");
  BitStream b;if(type=="chat")str8(b,text);else{b.Write(uint32_t(text.size()));b.Write(text.data(),text.size());}rpc(type=="chat"?101:50,b);
 }
 }catch(const std::exception&e){emit({{"type","error"},{"message",e.what()}});}
}
int main(int argc,char**argv){
 std::string host="127.0.0.1",name="Browser";int port=7777;
 for(int i=1;i+1<argc;i+=2){std::string k=argv[i];if(k=="--host")host=argv[i+1];else if(k=="--name")name=argv[i+1];else if(k=="--port")port=std::stoi(argv[i+1]);}
 signal(SIGTERM,[](int){stopRequested=1;});signal(SIGINT,[](int){stopRequested=1;});signal(SIGPIPE,SIG_IGN);
 for(int id:{139,128,68,129,137,138,163,32,101,93,12,13,19,164,165,159,160,70,71,130,38,39})client.RegisterAsRemoteProcedureCall(id,onRpc,reinterpret_cast<void*>(intptr_t(id)));
 client.SetMTUSize(576);client.SetTimeoutTime(10000);if(!client.Connect(host.c_str(),port,0,0,5)){emit({{"type","error"},{"message","Unable to start upstream connection"}});return 1;}int flags=fcntl(STDIN_FILENO,F_GETFL,0);if(flags<0||fcntl(STDIN_FILENO,F_SETFL,flags|O_NONBLOCK)<0){emit({{"type","error"},{"message","Cannot configure worker stdin"}});client.Disconnect(200);return 1;}
 std::string buffer;auto begin=std::chrono::steady_clock::now(),lastSync=begin;
 while(running&&!stopRequested){
  for(Packet*p=client.Receive();p;p=client.Receive()){
   if(!p->data||p->length==0){client.DeallocatePacket(p);continue;}
   try{
   int id=p->data[0];
   if(id==ID_CONNECTION_REQUEST_ACCEPTED){Reader r(p->data,p->length);r.skip(72);auto token=r.get<uint32_t>();BitStream b;b.Write(uint32_t(4057));b.Write(uint8_t(1));str8(b,name);b.Write(token^uint32_t(4057));std::random_device random;std::ostringstream serial;serial<<std::hex<<(uint64_t(random())*1001ull);str8(b,serial.str());str8(b,"0.3.7");rpc(25,b);std::cerr<<"transport accepted; sent player join\n";}
   else if(id==207||id==200||id==211)onSync(p);
   else if(id==ID_CONNECTION_LOST||id==ID_DISCONNECTION_NOTIFICATION||id==ID_CONNECTION_ATTEMPT_FAILED||id==ID_CONNECTION_BANNED||id==ID_INVALID_PASSWORD){emit({{"type","disconnected"},{"reason","Upstream connection ended (packet "+std::to_string(id)+")"}});running=false;}
   }catch(const std::exception&e){emit({{"type","error"},{"message",std::string("Invalid upstream packet: ")+e.what()}});running=false;}
   client.DeallocatePacket(p);
  }
  char chunk[4096];ssize_t n;while((n=read(0,chunk,sizeof(chunk)))>0){buffer.append(chunk,n);if(buffer.size()>65536){emit({{"type","error"},{"message","Input buffer overflow"}});running=false;break;}size_t end;while((end=buffer.find('\n'))!=std::string::npos){input(buffer.substr(0,end));buffer.erase(0,end+1);}}if(n==0)running=false;if(n<0&&errno!=EAGAIN&&errno!=EWOULDBLOCK&&errno!=EINTR){emit({{"type","error"},{"message","Worker stdin read failed"}});running=false;}
  auto now=std::chrono::steady_clock::now();auto rate=state.value("mode","onFoot")=="onFoot"?footRate:carRate;
  if(std::chrono::duration_cast<std::chrono::milliseconds>(now-lastSync).count()>=std::max(15u,std::min(rate,1000u))){syncState();lastSync=now;}
  if(!spawned&&now-begin>std::chrono::seconds(20)){emit({{"type","error"},{"message","Timed out waiting for upstream spawn"}});running=false;}
  usleep(5000);
 }
 client.Disconnect(200);return 0;
}
