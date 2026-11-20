import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API = (process.env.EXPO_PUBLIC_API_URL || 'https://navlog-api.onrender.com').replace(/\/$/, '');
const TASK = 'NAVLOG_BACKGROUND_LOCATION';
const ROUTE_KEY = 'navlog.activeRouteId';
const DEVICE_KEY = 'navlog.deviceId';
const CESIUM_TOKEN = process.env.EXPO_PUBLIC_CESIUM_ION_TOKEN || '';

type Point = { latitude:number; longitude:number; altitude:number|null; accuracy:number|null; speedKmh:number; heading:number|null; timestamp:string };
type Route = { id:string; startedAt:string; distanceM:number; averageSpeedKmh:number; durationS:number; segments?:any[]; points?:Point[] };

async function getDeviceId() {
  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (!id) { id = 'device-' + Math.random().toString(36).slice(2) + Date.now().toString(36); await AsyncStorage.setItem(DEVICE_KEY,id); }
  return id;
}
async function sendPoints(routeId:string, points:Point[]) {
  if (!points.length) return;
  const response = await fetch(`${API}/api/routes/${routeId}/points`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({points}) });
  if (!response.ok) throw new Error('Could not upload route points');
}

TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const locations = (data as { locations:Location.LocationObject[] }).locations || [];
  const routeId = await AsyncStorage.getItem(ROUTE_KEY);
  if (!routeId || !locations.length) return;
  const points:Point[] = locations.map(loc => ({
    latitude:loc.coords.latitude, longitude:loc.coords.longitude,
    altitude:loc.coords.altitude, accuracy:loc.coords.accuracy,
    speedKmh:Math.max(0,(loc.coords.speed || 0)*3.6),
    heading:loc.coords.heading, timestamp:new Date(loc.timestamp).toISOString()
  }));
  try { await sendPoints(routeId,points); } catch (e) { console.warn('NavLog background upload failed',e); }
});

const CESIUM_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link href="https://cesium.com/downloads/cesiumjs/releases/1.127/Build/Cesium/Widgets/widgets.css" rel="stylesheet"><style>html,body,#cesiumContainer{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background:#101827}.cesium-viewer-bottom{display:none}.cesium-widget-credits{display:none}</style></head><body><div id="cesiumContainer"></div><script src="https://cesium.com/downloads/cesiumjs/releases/1.127/Build/Cesium/Cesium.js"></script><script>
let viewer, path, marker, lastCamera=false, replayMarkers=[];
const models={person:'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumMan/Cesium_Man.glb',car:'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/GroundVehicle/GroundVehicle.glb',airplane:'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/Air/Air.glb'};
function report(type,extra={}){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type,...extra}));}
window.navlogInit=async(token)=>{if(viewer)return;try{Cesium.Ion.defaultAccessToken=token||'';viewer=new Cesium.Viewer('cesiumContainer',{terrainProvider:await Cesium.createWorldTerrainAsync(),animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,requestRenderMode:false});viewer.scene.globe.depthTestAgainstTerrain=true;path=viewer.entities.add({polyline:{positions:[],width:5,material:Cesium.Color.CYAN,clampToGround:true}});report('ready');}catch(e){report('error',{message:String(e)});}};
window.navlogUpdate=(p)=>{if(!viewer||!p)return;if(marker)marker.show=true;const pos=Cesium.Cartesian3.fromDegrees(p.longitude,p.latitude,p.altitude||0);const points=path.polyline.positions.getValue()||[];points.push(pos);path.polyline.positions=points;if(!marker)marker=viewer.entities.add({position:pos,model:{uri:models[p.marker]||models.person,scale:1.1,minimumPixelSize:42,maximumScale:120},label:{text:(p.speedKmh||0).toFixed(1)+' km/h',font:'14px sans-serif',fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:3,style:Cesium.LabelStyle.FILL_AND_OUTLINE,verticalOrigin:Cesium.VerticalOrigin.BOTTOM,pixelOffset:new Cesium.Cartesian2(0,-48)}});else{marker.position=pos;marker.model.uri=models[p.marker]||models.person;marker.label.text=(p.speedKmh||0).toFixed(1)+' km/h';}if(!lastCamera){viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(p.longitude,p.latitude,1800),duration:1.2});lastCamera=true;}};
window.navlogReplay=(points)=>{if(!viewer)return;replayMarkers.forEach(e=>viewer.entities.remove(e));replayMarkers=[];if(marker)marker.show=false;const list=points||[];path.polyline.positions=list.map(p=>Cesium.Cartesian3.fromDegrees(p.longitude,p.latitude,p.altitude||0));const step=Math.max(1,Math.ceil(list.length/1500));for(let i=0;i<list.length;i+=step){const p=list[i];const kind=p.marker||(p.speedKmh<15?'person':p.speedKmh<=250?'car':'airplane');const uri=models[kind]||models.person;const entity=viewer.entities.add({position:Cesium.Cartesian3.fromDegrees(p.longitude,p.latitude,p.altitude||0),model:{uri,scale:0.65,minimumPixelSize:20,maximumScale:65},label:{text:(p.speedKmh||0).toFixed(1)+' km/h',font:'10px sans-serif',fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:2,style:Cesium.LabelStyle.FILL_AND_OUTLINE,verticalOrigin:Cesium.VerticalOrigin.BOTTOM,pixelOffset:new Cesium.Cartesian2(0,-25)}});replayMarkers.push(entity);}if(list.length){const p=list[0];viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(p.longitude,p.latitude,2500)});}};
</script></body></html>`;

export default function App() {
  const web = useRef<WebView>(null);
  const [recording,setRecording]=useState(false);
  const [routeId,setRouteId]=useState<string|null>(null);
  const [speed,setSpeed]=useState(0);
  const [distance,setDistance]=useState(0);
  const [position,setPosition]=useState<Point|null>(null);
  const [loading,setLoading]=useState(false);
  const [history,setHistory]=useState<Route[]>([]);
  const [replay,setReplay]=useState(false);
  const watchRef=useRef<Location.LocationSubscription|null>(null);
  const lastUiPoint=useRef<Point|null>(null);

  const pushToMap=(p:Point)=>web.current?.injectJavaScript(`window.navlogUpdate(${JSON.stringify({...p,marker:p.speedKmh<15?'person':p.speedKmh<=250?'car':'airplane'})});true;`);
  useEffect(()=>{loadHistory();},[]);
  async function loadHistory(){
    try { const deviceId=await getDeviceId(); const r=await fetch(`${API}/api/routes?deviceId=${encodeURIComponent(deviceId)}`); if(r.ok)setHistory(await r.json()); } catch {}
  }
  useEffect(()=>()=>{watchRef.current?.remove();},[]);
  async function startRoute(){
    if(loading||recording)return;
    setLoading(true);
    try {
      let permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=='granted')throw new Error('Разрешите доступ к геолокации.');
      const bg=await Location.requestBackgroundPermissionsAsync();
      if(bg.status!=='granted')throw new Error('Для фоновой записи разрешите доступ к геолокации «Всегда».');
      const deviceId=await getDeviceId();
      const response=await fetch(`${API}/api/routes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId,startedAt:new Date().toISOString()})});
      if(!response.ok)throw new Error('Сервер не смог создать маршрут.');
      const route=await response.json();
      await AsyncStorage.setItem(ROUTE_KEY,route.id);
      setRouteId(route.id);setDistance(0);setSpeed(0);setRecording(true);
      await Location.startLocationUpdatesAsync(TASK,{
        accuracy:Location.Accuracy.BestForNavigation,timeInterval:3000,distanceInterval:5,
        pausesUpdatesAutomatically:false,showsBackgroundLocationIndicator:true,
        foregroundService:{ notificationTitle:'NavLog записывает маршрут',notificationBody:'GPS-запись продолжается в фоне',notificationColor:'#16c7d9' }
      });
      watchRef.current=await Location.watchPositionAsync({accuracy:Location.Accuracy.BestForNavigation,timeInterval:1000,distanceInterval:2},loc=>{
        const c=loc.coords; const p:Point={latitude:c.latitude,longitude:c.longitude,altitude:c.altitude,accuracy:c.accuracy,speedKmh:Math.max(0,(c.speed||0)*3.6),heading:c.heading,timestamp:new Date(loc.timestamp).toISOString()};
        if(lastUiPoint.current){const prev=lastUiPoint.current;const rad=(n:number)=>n*Math.PI/180;const dLat=rad(p.latitude-prev.latitude),dLon=rad(p.longitude-prev.longitude);const x=Math.sin(dLat/2)**2+Math.cos(rad(prev.latitude))*Math.cos(rad(p.latitude))*Math.sin(dLon/2)**2;setDistance(v=>v+2*6371000*Math.asin(Math.sqrt(x)));}
        lastUiPoint.current=p;setPosition(p);setSpeed(p.speedKmh);pushToMap(p);
      });
      const first=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.BestForNavigation});
      const c=first.coords;
      const p:Point={latitude:c.latitude,longitude:c.longitude,altitude:c.altitude,accuracy:c.accuracy,speedKmh:Math.max(0,(c.speed||0)*3.6),heading:c.heading,timestamp:new Date(first.timestamp).toISOString()};
      setPosition(p);setSpeed(p.speedKmh);pushToMap(p);
    } catch(e:any) { Alert.alert('Не удалось начать маршрут',e.message||'Проверьте разрешения и подключение к серверу.');setRecording(false); }
    finally { setLoading(false); }
  }
  async function stopRoute(){
    if(!routeId)return;
    setLoading(true);
    try {
      watchRef.current?.remove();watchRef.current=null;lastUiPoint.current=null;
      if(await Location.hasStartedLocationUpdatesAsync(TASK))await Location.stopLocationUpdatesAsync(TASK);
      const r=await fetch(`${API}/api/routes/${routeId}/finish`,{method:'POST'});
      if(!r.ok)throw new Error('Не удалось завершить маршрут на сервере.');
      await AsyncStorage.removeItem(ROUTE_KEY);
      setRecording(false);setRouteId(null);await loadHistory();
      Alert.alert('Маршрут сохранён','Маршрут и статистика участков сохранены в MongoDB.');
    } catch(e:any){Alert.alert('Ошибка',e.message||'Попробуйте ещё раз.');}
    finally{setLoading(false);}
  }
  async function openRoute(id:string){
    try{const r=await fetch(`${API}/api/routes/${id}`);if(!r.ok)throw new Error();const route=await r.json();web.current?.injectJavaScript(`window.navlogReplay(${JSON.stringify(route.points||[])});true;`);setReplay(true);if(route.segments?.length){const summary=route.segments.map((s:any)=>'Участок '+(s.index+1)+': '+s.averageSpeedKmh+' км/ч · '+(s.distanceM/1000).toFixed(2)+' км · '+s.marker).join('\\n');Alert.alert('Скорость по участкам',summary);}}
    catch{Alert.alert('Ошибка','Не удалось загрузить маршрут.');}
  }
  return <SafeAreaView style={styles.root}>
    <StatusBar barStyle="light-content"/>
    <View style={styles.header}><View><Text style={styles.brand}>NAVLOG</Text><Text style={styles.subtitle}>3D ROUTE RECORDER</Text></View><View style={styles.live}><View style={[styles.dot,{backgroundColor:recording?'#36df9a':'#687789'}]}/><Text style={styles.liveText}>{recording?'ЗАПИСЬ':'ГОТОВ'}</Text></View></View>
    <View style={styles.map}><WebView ref={web} originWhitelist={['*']} source={{html:CESIUM_HTML}} javaScriptEnabled domStorageEnabled onLoadEnd={()=>web.current?.injectJavaScript(`window.navlogInit(${JSON.stringify(CESIUM_TOKEN)});true;`)} onMessage={e=>{try{const m=JSON.parse(e.nativeEvent.data);if(m.type==='error')console.warn('Cesium:',m.message);}catch{}}} /></View>
    <View style={styles.stats}>
      <View><Text style={styles.metricLabel}>ТЕКУЩАЯ СКОРОСТЬ</Text><Text style={styles.speed}>{speed.toFixed(1)} <Text style={styles.unit}>км/ч</Text></Text></View>
      <View style={styles.statRight}><Text style={styles.metricLabel}>ДИСТАНЦИЯ</Text><Text style={styles.distance}>{(distance/1000).toFixed(2)} км</Text></View>
    </View>
    <TouchableOpacity disabled={loading} style={[styles.action,{backgroundColor:recording?'#d84b55':'#0aa6b5'}]} onPress={recording?stopRoute:startRoute}>
      {loading?<ActivityIndicator color="white"/>:<Text style={styles.actionText}>{recording?'ЗАВЕРШИТЬ МАРШРУТ':'НАЧАТЬ МАРШРУТ'}</Text>}
    </TouchableOpacity>
    <View style={styles.historyHead}><Text style={styles.section}>ИСТОРИЯ МАРШРУТОВ</Text><TouchableOpacity onPress={loadHistory}><Text style={styles.refresh}>ОБНОВИТЬ</Text></TouchableOpacity></View>
    <View style={styles.historyList}>{history.slice(0,3).map(item=><TouchableOpacity key={item.id} style={styles.historyItem} onPress={()=>openRoute(item.id)}><View><Text style={styles.routeName}>Маршрут · {new Date(item.startedAt).toLocaleDateString()}</Text><Text style={styles.routeMeta}>{((item.distanceM||0)/1000).toFixed(2)} км · {item.averageSpeedKmh||0} км/ч средняя</Text></View><Text style={styles.open}>3D ↗</Text></TouchableOpacity>)}{!history.length&&<Text style={styles.empty}>Завершённые маршруты появятся здесь</Text>}</View>
    {replay&&<TouchableOpacity style={styles.closeReplay} onPress={()=>{setReplay(false);web.current?.injectJavaScript('window.navlogReplay([]);true;')}}><Text style={styles.closeText}>ЗАКРЫТЬ ПРОСМОТР</Text></TouchableOpacity>}
  </SafeAreaView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:'#0a1220',paddingTop:8},header:{height:58,paddingHorizontal:20,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{color:'#f4fbff',fontSize:22,fontWeight:'900',letterSpacing:3},subtitle:{color:'#668092',fontSize:9,letterSpacing:2,marginTop:1},live:{flexDirection:'row',alignItems:'center',gap:7,backgroundColor:'#172637',paddingHorizontal:12,paddingVertical:8,borderRadius:20},dot:{width:7,height:7,borderRadius:4},liveText:{color:'#c4d6e4',fontSize:10,fontWeight:'800',letterSpacing:1},map:{flex:1,marginHorizontal:10,borderRadius:18,overflow:'hidden',borderWidth:1,borderColor:'#233b50'},stats:{height:92,paddingHorizontal:22,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},metricLabel:{color:'#6c8598',fontSize:9,fontWeight:'800',letterSpacing:1},speed:{color:'#f3fbff',fontSize:35,fontWeight:'800',marginTop:2},unit:{fontSize:14,color:'#8ba2b4'},statRight:{alignItems:'flex-end'},distance:{color:'#e1edf5',fontSize:23,fontWeight:'700',marginTop:7},action:{height:54,marginHorizontal:16,borderRadius:14,alignItems:'center',justifyContent:'center'},actionText:{color:'white',fontSize:13,fontWeight:'900',letterSpacing:1.4},historyHead:{paddingHorizontal:20,paddingTop:18,paddingBottom:8,flexDirection:'row',justifyContent:'space-between'},section:{color:'#8ea6b9',fontSize:10,fontWeight:'900',letterSpacing:1.5},refresh:{color:'#19b9c9',fontSize:9,fontWeight:'800'},historyList:{minHeight:65,paddingHorizontal:16,paddingBottom:12},historyItem:{backgroundColor:'#111f30',padding:11,borderRadius:10,marginBottom:6,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},routeName:{color:'#e8f2f8',fontSize:12,fontWeight:'700'},routeMeta:{color:'#7c95a8',fontSize:10,marginTop:3},open:{color:'#1dc4d2',fontWeight:'800',fontSize:11},empty:{color:'#61798b',fontSize:11,padding:10},closeReplay:{position:'absolute',right:20,top:75,backgroundColor:'#0c9ba9',padding:10,borderRadius:8},closeText:{color:'white',fontWeight:'800',fontSize:10}
});