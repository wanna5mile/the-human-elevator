// server/index.js
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });
console.log("WebSocket server running on port", PORT);

// basic rooms map -> { clients: Set(ws), players: Map(id->player), coins: Map(id->coin) }
const rooms = new Map();

const COIN_COUNT = 32;
const COIN_RESPAWN_MS = 45000;
const WORLD_BOUND = 140; // +/- area for random coin spawn

function randomPos() {
  return {
    x: Math.floor(Math.random() * (WORLD_BOUND * 2) - WORLD_BOUND),
    z: Math.floor(Math.random() * (WORLD_BOUND * 2) - WORLD_BOUND)
  };
}

function ensureRoom(roomName) {
  if(!rooms.has(roomName)) {
    rooms.set(roomName, {
      clients: new Set(),
      players: new Map(),
      coins: new Map()
    });
    // create coins once per room
    const r = rooms.get(roomName);
    for(let i=0;i<COIN_COUNT;i++){
      const p = randomPos();
      r.coins.set(i, { id:i, x:p.x, z:p.z, active:true, timer:null });
    }
  }
  return rooms.get(roomName);
}

function broadcastRoom(roomName, message, exceptSocket=null){
  const r = rooms.get(roomName);
  if(!r) return;
  const data = JSON.stringify(message);
  for(const client of r.clients){
    if(client === exceptSocket) continue;
    if(client.readyState === WebSocket.OPEN) client.send(data);
  }
}

function scheduleRespawn(roomName, coinId){
  const r = rooms.get(roomName);
  if(!r) return;
  const coin = r.coins.get(coinId);
  if(!coin) return;
  if(coin.timer) clearTimeout(coin.timer);
  coin.timer = setTimeout(()=>{
    const p = randomPos();
    coin.x = p.x; coin.z = p.z; coin.active = true; coin.timer = null;
    broadcastRoom(roomName, { type: "coinUpdate", id: coinId, active: true, x: coin.x, z: coin.z });
  }, COIN_RESPAWN_MS);
}

wss.on("connection", (ws) => {
  ws._meta = { id: null, room: "" };

  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch(e){ return; }

    // join message
    if(data.type === "join"){
      const room = data.room || "default";
      ws._meta.id = data.id || ("p"+Math.random().toString(36).slice(2,9));
      ws._meta.room = room;
      const r = ensureRoom(room);
      r.clients.add(ws);
      r.players.set(ws._meta.id, { id: ws._meta.id, x:0,y:0,z:0, colorHex: data.colorHex || null, coins: 0 });
      // notify everyone else
      broadcastRoom(room, { type: "playerJoined", id: ws._meta.id, x:0,y:0,z:0, colorHex: data.colorHex });
    }

    if(data.type === "requestInit"){
      const room = data.room || "default";
      ensureRoom(room);
      const r = rooms.get(room);
      // send init payload
      const coins = Array.from(r.coins.values()).map(c => ({ id:c.id, x:c.x, z:c.z, active:c.active }));
      const players = Array.from(r.players.values());
      ws.send(JSON.stringify({ type: "init", coins, players }));
      return;
    }

    // state update from client
    if(data.type === "state"){
      const room = data.room || ws._meta.room || "default";
      const r = ensureRoom(room);
      if(ws._meta.id) {
        // update server player state
        r.players.set(ws._meta.id, { id: ws._meta.id, x: data.x, y:data.y, z:data.z, colorHex: data.colorHex, coins: data.coins || 0 });
        // broadcast to others
        broadcastRoom(room, { type:"state", id: ws._meta.id, x: data.x, y:data.y, z:data.z, colorHex: data.colorHex, coins: data.coins || 0 }, ws);
      }
      return;
    }

    // collect attempt
    if(data.type === "collect"){
      const room = data.room || ws._meta.room || "default";
      const r = ensureRoom(room);
      const coin = r.coins.get(data.id);
      if(!coin) return;
      // naive validation: accept collect if coin active; for a basic check we could validate distance if the client sends player pos
      if(coin.active){
        coin.active = false;
        // clear respawn timer if any
        if(coin.timer) { clearTimeout(coin.timer); coin.timer = null; }
        // broadcast coin update to room
        broadcastRoom(room, { type: "coinUpdate", id: coin.id, active: false });
        // schedule respawn
        scheduleRespawn(room, coin.id);
        // optionally update player's score on server
        const pid = data.player;
        const player = r.players.get(pid);
        if(player){
          player.coins = (player.coins || 0) + 1;
          // broadcast player coins update (optional)
          broadcastRoom(room, { type: "state", id: player.id, x: player.x, y: player.y, z: player.z, colorHex: player.colorHex, coins: player.coins });
        }
      }
      return;
    }

  });

  ws.on("close", () => {
    const id = ws._meta.id; const room = ws._meta.room || "default";
    if(!rooms.has(room)) return;
    const r = rooms.get(room);
    r.clients.delete(ws);
    r.players.delete(id);
    broadcastRoom(room, { type: "playerLeft", id });
    // optional cleanup empty rooms
    if(r.clients.size === 0){
      // clear timers for coins
      for(const c of r.coins.values()){
        if(c.timer) clearTimeout(c.timer);
      }
      rooms.delete(room);
    }
  });

});

console.log("Server ready.");
