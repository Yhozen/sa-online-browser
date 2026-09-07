// SPDX-License-Identifier: GPL-3.0-or-later
#define main worker_entry
#include "worker.cpp"
#undef main
#include <ReliabilityLayer.h>
#include <stdexcept>
void check(bool ok,const char*message){if(!ok)throw std::runtime_error(message);}
std::string capture(std::function<void()>f){std::ostringstream out;auto*old=std::cout.rdbuf(out.rdbuf());f();std::cout.rdbuf(old);return out.str();}
void feed(ReliabilityLayer&layer,unsigned part,unsigned count,const std::string&data,unsigned message){
 BitStream b;b.Write(false);b.Write(uint16_t(message));uint8_t reliability=RELIABLE;b.WriteBits(&reliability,4);b.Write(true);b.Write(uint16_t(7));b.WriteCompressed(uint32_t(part));b.WriteCompressed(uint32_t(count));b.WriteCompressed(uint16_t(data.size()*8));b.WriteAlignedBytes((const uint8_t*)data.data(),data.size());
 DataStructures::List<PluginInterface*> plugins;bool ban=false;layer.HandleSocketReceiveFromConnectedPlayer((char*)b.GetData(),b.GetNumberOfBytesUsed(),{0x0100007f,7777},plugins,576,ban);
}
int main(){try{
 {uint8_t bytes[]={0x01,0x34,0x12};Reader r(bytes,sizeof(bytes));check(r.get<uint8_t>()==1&&r.get<uint16_t>()==0x1234,"little endian fixture");bool threw=false;try{r.get<float>();}catch(...){threw=true;}check(threw,"truncated read rejected");}
 {uint8_t bytes[]={0xff};Reader r(bytes,1);bool threw=false;try{r.str8();}catch(...){threw=true;}check(threw,"invalid string length rejected");}
 {BitStream b;b.Write(float(0.000001));Reader r(b.GetData(),b.GetNumberOfBytesUsed());check(r.velocity()==Vec{0,0,0},"compressed velocity epsilon follows server");}
 {BitStream b;b.Write(uint8_t(207));b.Write(uint16_t(42));b.Write(false);b.Write(false);b.Write(uint16_t(8));writeVec(b,{12,-3,10});b.WriteNormQuat(1.f,0.f,0.f,0.f);b.Write(uint8_t(0xf0));b.Write(uint8_t(0));b.Write(uint8_t(0));b.Write(0.f);b.Write(false);b.Write(false);Packet p{};p.data=b.GetData();p.length=b.GetNumberOfBytesUsed();p.bitSize=b.GetNumberOfBitsUsed();auto e=json::parse(capture([&]{onSync(&p);}));check(e["id"]==42&&e["position"]==json({12,-3,10})&&e["mode"]=="onFoot","server direction compressed onFoot fixture");}
 {BitStream b;b.Write(uint8_t(211));b.Write(uint16_t(42));b.Write(uint16_t(1));b.Write(uint16_t(1));b.Write(uint8_t(100));b.Write(uint8_t(0));b.Write(uint16_t(0));b.Write(uint16_t(0));b.Write(uint16_t(0));writeVec(b,{0,6,10});Packet p{};p.data=b.GetData();p.length=b.GetNumberOfBytesUsed();p.bitSize=b.GetNumberOfBitsUsed();auto e=json::parse(capture([&]{onSync(&p);}));check(e["seat"]==1&&e["position"]==json({0,6,10}),"server passenger fixture has raw health bytes");}
 {ReliabilityLayer layer;feed(layer,1,2,"world",0);uint8_t*out=nullptr;check(layer.Receive(&out)==0,"partial fragment hidden");feed(layer,0,2,"hello",1);int bits=layer.Receive(&out);check(bits==80&&std::string((char*)out,bits/8)=="helloworld","reordered fragment assembly");delete[]out;}
 for(unsigned count:{0u,257u}){ReliabilityLayer layer;feed(layer,0,count,"invalid",0);uint8_t*out=nullptr;check(layer.Receive(&out)==0,"fragment count bounded");}
 {ReliabilityLayer layer;feed(layer,2,2,"invalid",0);uint8_t*out=nullptr;check(layer.Receive(&out)==0,"fragment index bounded");}
 {ReliabilityLayer layer;feed(layer,0,2,"hello",0);feed(layer,0,2,"evil!",1);feed(layer,1,2,"world",2);uint8_t*out=nullptr;int bits=layer.Receive(&out);check(bits==80&&std::string((char*)out,bits/8)=="helloworld","duplicate fragment index ignored");delete[]out;}
 {auto before=state;auto error=capture([]{input(R"({"type":"state","position":[1,2,"bad"],"rotation":[1,0,0,0],"velocity":[0,0,0]})");});check(json::parse(error)["type"]=="error"&&state==before,"invalid JSON state rejected atomically");}
 {controlRevision=7;auto before=state;json j=state;j["type"]="state";j["position"]={9,9,10};j["controlRevision"]=6u;capture([&]{input(j.dump());});check(state==before,"stale position revision ignored");j["controlRevision"]=7u;capture([&]{input(j.dump());});check(state["position"]==json({9,9,10}),"current revision accepted");before=state;j["mode"]="driver";j["vehicleId"]=1;j["seat"]=0;capture([&]{input(j.dump());});check(state==before,"browser cannot allocate its own seat");}
 {uint8_t data[]={0};RPCParameters p{};p.input=data;p.numberOfBitsOfData=8;auto out=json::parse(capture([&]{onRpc(&p,reinterpret_cast<void*>(139));}));check(out["type"]=="error"&&!running,"truncated init fails connection explicitly");running=true;}
 std::cout<<"PASS: directional codecs, malformed values, truncated reads, bounded reordered fragmentation\n";return 0;
 }catch(const std::exception&e){std::cerr<<"FAIL: "<<e.what()<<'\n';return 1;}}
