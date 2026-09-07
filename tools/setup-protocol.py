#!/usr/bin/env python3
"""Fetch pinned GPL RakNet source and apply client-only adaptations reproducibly."""
import pathlib, subprocess, re, shutil
ROOT=pathlib.Path(__file__).resolve().parents[1]
DEST=ROOT/'native'/'vendor'/'raknet'
REV='417077754bed5c23c38d64fb39c5a629790c091b'
if not DEST.exists():
 DEST.parent.mkdir(parents=True,exist_ok=True)
 subprocess.run(['git','clone','https://github.com/openmultiplayer/RakNet.git',str(DEST)],check=True)
subprocess.run(['git','-C',str(DEST),'checkout','--force',REV],check=True,stdout=subprocess.DEVNULL)
def edit(path,fn):
 p=DEST/path;p.write_text(fn(p.read_text()))
def body(s, signature, replacement):
 start=s.index('{',s.index(signature)); depth=1; end=start+1
 while depth:
  depth += (s[end]=='{')-(s[end]=='}');end+=1
 return s[:start]+'{'+replacement+'}'+s[end:]
def header(s):
 s=s.replace('#include "../../Server/Components/LegacyNetwork/Query/query.hpp"','''#include <unordered_map>
#include <unordered_set>
#include <string_view>
#include <ctime>
#include <cstdlib>
#include <cstdio>
using StringView=std::string_view;
template<class A,class B> using Pair=std::pair<A,B>;
template<class A,class B> using FlatHashMap=std::unordered_map<A,B>;
template<class A> using FlatHashSet=std::unordered_set<A>;
class Query {};
enum class LogLevel { Warning };
struct ICore { template<class... T> void printLn(const char* f,T... t){fprintf(stderr,f,t...);fputc('\\n',stderr);} template<class... T> void logLn(LogLevel,const char* f,T... t){printLn(f,t...);} };''')
 s=s.replace('return core_;','static ICore logger; return &logger;')
 s=body(s,'static bool IsOmpEncryptionEnabled()', 'return false;')
 s=s.replace('static uint8_t* Decrypt', 'static std::string AuthResponse(std::string_view challenge);\n static uint8_t* ClientEncrypt(const uint8_t* src, int len, uint16_t port);\n static uint8_t* Decrypt')
 return s
edit(pathlib.Path('SAMPRakNet.hpp'),header)
def samp(s):
 key=re.search(r'key\[256\].*?=\s*\{(.*?)\};',s,re.S).group(1)
 s=body(s,'HandleQuery(SOCKET','')
 s=body(s,'bool SAMPRakNet::OnConnectionRequest','return false;')
 s+='''\nstd::string SAMPRakNet::AuthResponse(std::string_view challenge) { for(auto &entry: AuthTable) if(entry.send==challenge.substr(0,challenge.find(char(0)))) return std::string(entry.recv); return {}; }
uint8_t* SAMPRakNet::ClientEncrypt(const uint8_t* src,int len,uint16_t port) {
 static const uint8_t key[256]={'''+key+'''};
 static thread_local uint8_t out[MAXIMUM_MTU_SIZE+1];
 uint8_t inverse[256];for(int i=0;i<256;i++)inverse[key[i]]=i;
 out[0]=0;for(int i=0;i<len;i++){out[0]^=src[i]&0xAA;out[i+1]=inverse[src[i]];if(i&1)out[i+1]^=uint8_t(port^0xCC);}return out;
}
'''
 return s
edit(pathlib.Path('SAMPRakNet.cpp'),samp)
def socket(s):
 start=s.index('\t\tif (len > 10');end=s.index('\t\treturn 1;',s.index('#endif',start))
 s=s[:start]+'''        ProcessNetworkPacket(sa.sin_addr.s_addr, ntohs(sa.sin_port), data, len, rakPeer);
'''+s[end:]
 start=s.index('\t\t// TODO - use WSASendTo');end=s.index('\n\t}\n\twhile ( len == 0 );',start)
 s=s[:start]+'''        if (length > MAXIMUM_MTU_SIZE) return -1;
        auto encrypted=SAMPRakNet::ClientEncrypt((const uint8_t*)data,length,port);
        len=sendto(s,(const char*)encrypted,length+1,0,(const sockaddr*)&sa,sizeof(sa));'''+s[end:]
 return s
edit(pathlib.Path('Source/SocketLayer.cpp'),socket)
def peer(s):
 s=s.replace('if (!remoteSystem->isLogon)','if (!remoteSystem->weInitiatedTheConnection && !remoteSystem->isLogon)')
 anchor='\t\tconst bool needsBanCheck'
 ix=s.index(anchor)
 s=s[:ix]+'''        if (length==3 && (uint8_t)data[0]==ID_OPEN_CONNECTION_COOKIE) {
            uint16_t cookie;memcpy(&cookie,data+1,2);cookie^=0x6969;
            char reply[3];reply[0]=ID_OPEN_CONNECTION_REQUEST;memcpy(reply+1,&cookie,2);
            SocketLayer::Instance()->SendTo(rakPeer->connectionSocket,reply,3,binaryAddress,port);return;
        }
'''+s[ix:]
 anchor='else if ( (unsigned char)(data)[0] == ID_DETECT_LOST_CONNECTIONS'
 ix=s.index(anchor)
 s=s[:ix]+'''else if ((uint8_t)data[0] == ID_AUTH_KEY && remoteSystem->weInitiatedTheConnection) {
                            if(byteSize>=2 && data[1]<=byteSize-2) {
                                auto response=SAMPRakNet::AuthResponse(std::string_view((char*)data+2,data[1]));
                                if(!response.empty()) {
                                    RakNet::BitStream auth;auth.Write((uint8_t)ID_AUTH_KEY);auth.Write((uint8_t)response.size());auth.Write(response.c_str(),response.size());
                                    SendImmediate((char*)auth.GetData(),auth.GetNumberOfBitsUsed(),SYSTEM_PRIORITY,RELIABLE,0,playerId,false,false,RakNet::GetTimeNS());
                                }
                            }
                            delete[] data;
                        }
                        '''+s[ix:]
 return s
edit(pathlib.Path('Source/RakPeer.cpp'),peer)
def reliability(s):
 start=s.index('#ifdef _DEBUG\n\t\tSAMPRakNet::GetCore()->logLn(LogLevel::Warning, "dropping a split packet')
 end=s.index('\n\t}\n\telse',start)
 s=s[:start]+'''        // Server may fragment initialization; cap the reassembly surface.
        if(internalPacket->splitPacketCount==0 || internalPacket->splitPacketCount>256 || internalPacket->splitPacketIndex>=internalPacket->splitPacketCount) {
            internalPacketPool.ReleasePointer(internalPacket);return 0;
        }'''+s[end:]
 s=s.replace('index=splitPacketChannelList.GetIndexFromKey(internalPacket->splitPacketId, &objectExists);','''index=splitPacketChannelList.GetIndexFromKey(internalPacket->splitPacketId, &objectExists);
    bool invalid = !objectExists && splitPacketChannelList.Size()>=16;
    if(objectExists) {
        auto &list=splitPacketChannelList[index]->splitPacketList;
        if(list.Size() && list[0]->splitPacketCount!=internalPacket->splitPacketCount) invalid=true;
        for(unsigned j=0;j<list.Size();++j) if(list[j]->splitPacketIndex==internalPacket->splitPacketIndex) invalid=true;
    }
    if(invalid){delete[] internalPacket->data;internalPacketPool.ReleasePointer(internalPacket);return;}''')
 return s
edit(pathlib.Path('Source/ReliabilityLayer.cpp'),reliability)
# nlohmann single header: immutable release, verified SHA256.
import urllib.request,hashlib
p=ROOT/'native/vendor/json.hpp'
if not p.exists():p.write_bytes(urllib.request.urlopen('https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp').read())
assert hashlib.sha256(p.read_bytes()).hexdigest()=='9bea4c8066ef4a1c206b2be5a36302f8926f7fdc6087af5d20b417d0cf103ea6'
