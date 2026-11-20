import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*'}));
app.use(express.json({ limit: '2mb' }));

const port = Number(process.env.PORT || 10000);
const client = new MongoClient(process.env.MONGODB_URI);
let routes;

const validPoint = p => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude)
  && p.latitude >= -90 && p.latitude <= 90 && p.longitude >= -180 && p.longitude <= 180;

function distanceMeters(a, b) {
  const r = 6371000, rad = n => n * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
  return 2*r*Math.asin(Math.sqrt(x));
}
function markerForSpeed(speed) {
  if (speed < 15) return 'person';
  if (speed <= 250) return 'car';
  return 'airplane';
}
function enrichPoints(points) {
  return points.map((p, i) => {
    const prev = points[i-1];
    const elapsed = prev ? Math.max(0.1, (new Date(p.timestamp)-new Date(prev.timestamp))/1000) : 0;
    const distance = prev ? distanceMeters(prev, p) : 0;
    const calculatedSpeed = elapsed > 0 ? distance / elapsed * 3.6 : 0;
    const speedKmh = Number.isFinite(p.speedKmh) && p.speedKmh >= 0 ? p.speedKmh : calculatedSpeed;
    return { ...p, distanceFromPreviousM: Math.round(distance*10)/10, speedKmh: Math.round(speedKmh*10)/10, marker: markerForSpeed(speedKmh) };
  });
}
function makeSegments(points) {
  if (!points.length) return [];
  const segments = [];
  let start = 0, mode = points[0].marker;
  for (let i=1; i<=points.length; i++) {
    if (i===points.length || points[i].marker !== mode) {
      const slice = points.slice(start, i);
      const distanceM = slice.reduce((sum,p)=>sum+(p.distanceFromPreviousM||0),0);
      const durationS = slice.length > 1 ? Math.max(0,(new Date(slice.at(-1).timestamp)-new Date(slice[0].timestamp))/1000) : 0;
      const speeds = slice.map(p=>p.speedKmh).filter(Number.isFinite);
      segments.push({ index: segments.length, startPoint: start, endPoint: i-1, marker: mode, distanceM: Math.round(distanceM), durationS: Math.round(durationS), averageSpeedKmh: speeds.length ? Math.round(speeds.reduce((a,b)=>a+b,0)/speeds.length*10)/10 : 0 });
      start=i; mode=points[i]?.marker;
    }
  }
  return segments;
}

app.get('/health', (_req,res)=>res.json({ ok:true, service:'navlog-api', database: client.topology?.isConnected?.() ? 'connected' : 'configured' }));
app.post('/api/routes', async (req,res) => {
  const { deviceId, startedAt, title } = req.body || {};
  if (typeof deviceId !== 'string' || !deviceId.trim()) return res.status(400).json({ error:'deviceId is required' });
  const doc = { deviceId, title: typeof title==='string' ? title.slice(0,100) : 'New route', startedAt: startedAt ? new Date(startedAt) : new Date(), endedAt:null, status:'recording', points:[], segments:[], distanceM:0, createdAt:new Date() };
  const result = await routes.insertOne(doc);
  res.status(201).json({ id:result.insertedId.toString(), ...doc });
});
app.post('/api/routes/:id/points', async (req,res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error:'Invalid route id' });
  const incoming = Array.isArray(req.body?.points) ? req.body.points.slice(0,500) : [req.body];
  if (!incoming.length || incoming.some(p=>!validPoint(p))) return res.status(400).json({ error:'Each point needs valid latitude and longitude' });
  const route = await routes.findOne({ _id:new ObjectId(req.params.id), status:'recording' });
  if (!route) return res.status(404).json({ error:'Recording route not found' });
  const normalized = incoming.map(p=>({ latitude:p.latitude, longitude:p.longitude, altitude:Number.isFinite(p.altitude)?p.altitude:null, accuracy:Number.isFinite(p.accuracy)?p.accuracy:null, speedKmh:Number.isFinite(p.speedKmh)?Math.max(0,p.speedKmh):null, heading:Number.isFinite(p.heading)?p.heading:null, timestamp:p.timestamp ? new Date(p.timestamp) : new Date() }));
  const all = enrichPoints([...route.points, ...normalized]);
  const segments = makeSegments(all);
  const distanceM = all.reduce((sum,p)=>sum+(p.distanceFromPreviousM||0),0);
  await routes.updateOne({ _id:route._id, status:'recording' }, { $set:{ points:all, segments, distanceM:Math.round(distanceM) } });
  res.json({ accepted:normalized.length, totalPoints:all.length, distanceM:Math.round(distanceM), segments });
});
app.post('/api/routes/:id/finish', async (req,res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error:'Invalid route id' });
  const route = await routes.findOne({ _id:new ObjectId(req.params.id), status:'recording' });
  if (!route) return res.status(404).json({ error:'Recording route not found' });
  const endedAt = new Date();
  const durationS = Math.max(0,Math.round((endedAt-route.startedAt)/1000));
  const averageSpeedKmh = durationS ? Math.round((route.distanceM/1000)/(durationS/3600)*10)/10 : 0;
  await routes.updateOne({ _id:route._id }, { $set:{ status:'completed', endedAt, durationS, averageSpeedKmh } });
  res.json({ id:route._id.toString(), status:'completed', endedAt, durationS, distanceM:route.distanceM, averageSpeedKmh, segments:route.segments });
});
app.get('/api/routes', async (req,res) => {
  const deviceId = String(req.query.deviceId || '');
  if (!deviceId) return res.status(400).json({ error:'deviceId is required' });
  const docs = await routes.find({ deviceId, status:'completed' }, { projection:{ points:0 } }).sort({ startedAt:-1 }).limit(100).toArray();
  res.json(docs.map(d=>({ ...d, id:d._id.toString(), _id:undefined })));
});
app.get('/api/routes/:id', async (req,res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error:'Invalid route id' });
  const doc = await routes.findOne({ _id:new ObjectId(req.params.id) });
  if (!doc) return res.status(404).json({ error:'Route not found' });
  res.json({ ...doc, id:doc._id.toString(), _id:undefined });
});
app.use((err,_req,res,_next)=>{ console.error(err); res.status(500).json({ error:'Internal server error' }); });

await client.connect();
const db = client.db(process.env.MONGODB_DB || 'navlog');
routes = db.collection('routes');
await routes.createIndex({ deviceId:1, startedAt:-1 });
await routes.createIndex({ status:1 });
app.listen(port,'0.0.0.0',()=>console.log(`NavLog API listening on ${port}`));