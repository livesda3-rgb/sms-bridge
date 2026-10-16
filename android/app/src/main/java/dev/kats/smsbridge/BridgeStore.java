package dev.kats.smsbridge;

import android.content.*;
import android.database.*;
import android.database.sqlite.*;
import org.json.*;
import java.util.*;
import java.security.MessageDigest;

final class BridgeStore extends SQLiteOpenHelper {
    final Context context;
    BridgeStore(Context c){super(c,"bridge.db",null,1);context=c.getApplicationContext();}
    public void onCreate(SQLiteDatabase d){
        d.execSQL("CREATE TABLE recipients (id TEXT PRIMARY KEY, name TEXT NOT NULL, subscription TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1)");
        d.execSQL("CREATE TABLE routes (sim TEXT PRIMARY KEY, id TEXT NOT NULL, label TEXT NOT NULL, number TEXT NOT NULL, recipient TEXT)");
        d.execSQL("CREATE TABLE invites (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)");
        d.execSQL("CREATE TABLE queue (id TEXT PRIMARY KEY, sim TEXT, recipient TEXT NOT NULL, payload TEXT NOT NULL, created INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next INTEGER NOT NULL DEFAULT 0)");
        d.execSQL("CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT)");
    }
    public void onUpgrade(SQLiteDatabase d,int a,int b){}
    static String digest(String token) throws Exception{return WebPush.b64(MessageDigest.getInstance("SHA-256").digest(WebPush.utf(token)));}
    JSONObject invite() throws Exception {
        String token=WebPush.b64(WebPush.random(32));long expires=System.currentTimeMillis()+15*60*1000;
        SQLiteDatabase d=getWritableDatabase();d.delete("invites","expires<?",new String[]{""+System.currentTimeMillis()});
        ContentValues v=new ContentValues();v.put("hash",digest(token));v.put("expires",expires);d.insertOrThrow("invites",null,v);
        return new JSONObject().put("version",1).put("type","sms-bridge-source").put("sourceId",Identity.source(context)).put("name","Домашний телефон").put("publicKey",WebPush.b64(WebPush.point(Identity.publicKey()))).put("pairingToken",token).put("expiresAt",expires);
    }
    JSONObject validateRecipient(String input) throws Exception {
        if(input.length()>16000)throw new IllegalArgumentException("Слишком большие данные");JSONObject r=new JSONObject(input);
        if(r.getInt("version")!=1||!"sms-bridge-recipient".equals(r.getString("type"))||!Identity.source(context).equals(r.getString("sourceId"))||!WebPush.b64(WebPush.point(Identity.publicKey())).equals(r.getString("publicKey")))throw new IllegalArgumentException("Данные от другого домашнего устройства");
        String token=r.getString("pairingToken");if(token.length()!=43)throw new IllegalArgumentException("Неверный код привязки");
        try(Cursor c=getReadableDatabase().rawQuery("SELECT expires FROM invites WHERE hash=?",new String[]{digest(token)})){if(!c.moveToFirst()||c.getLong(0)<System.currentTimeMillis())throw new IllegalArgumentException("Код уже использован или истёк. Создайте новое подключение (15 минут)");}
        String id=r.getString("recipientId"),name=r.getString("name");if(!id.matches("[A-Za-z0-9-]{16,80}")||name.trim().isEmpty()||name.length()>80)throw new IllegalArgumentException("Неверное имя получателя");
        JSONObject sub=r.getJSONObject("subscription"),keys=sub.getJSONObject("keys");WebPush.endpoint(sub.getString("endpoint"));WebPush.publicKey(WebPush.un64(keys.getString("p256dh")));if(WebPush.un64(keys.getString("auth")).length!=16)throw new IllegalArgumentException("Неверный ключ подписки");
        return new JSONObject().put("recipientId",id).put("name",name).put("pairingToken",token).put("subscription",new JSONObject().put("endpoint",sub.getString("endpoint")).put("keys",new JSONObject().put("p256dh",keys.getString("p256dh")).put("auth",keys.getString("auth"))));
    }
    void approve(String input) throws Exception {
        SQLiteDatabase d=getWritableDatabase();d.beginTransaction();try{
            JSONObject r=validateRecipient(input);String id=r.getString("recipientId");
            ContentValues v=new ContentValues();v.put("id",id);v.put("name",r.getString("name"));v.put("subscription",r.getJSONObject("subscription").toString());v.put("enabled",1);
            d.insertWithOnConflict("recipients",null,v,SQLiteDatabase.CONFLICT_REPLACE);
            d.delete("queue","recipient=?",new String[]{id});d.delete("invites","hash=?",new String[]{digest(r.getString("pairingToken"))});d.setTransactionSuccessful();
        }finally{d.endTransaction();}
    }
    List<String[]> recipients(){List<String[]> result=new ArrayList<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT id,name,enabled FROM recipients ORDER BY name",null)){while(c.moveToNext())result.add(new String[]{c.getString(0),c.getString(1),c.getInt(2)==1?"активен":"нужна новая привязка"});}return result;}
    void revoke(String id){SQLiteDatabase d=getWritableDatabase();d.beginTransaction();try{d.delete("recipients","id=?",new String[]{id});d.delete("queue","recipient=?",new String[]{id});ContentValues v=new ContentValues();v.putNull("recipient");d.update("routes",v,"recipient=?",new String[]{id});d.setTransactionSuccessful();}finally{d.endTransaction();}}
    String[] route(String sim){try(Cursor c=getReadableDatabase().rawQuery("SELECT id,label,number,recipient FROM routes WHERE sim=?",new String[]{sim})){return c.moveToFirst()?new String[]{c.getString(0),c.getString(1),c.getString(2),c.getString(3)}:null;}}
    void route(String sim,String label,String number,String recipient){SQLiteDatabase d=getWritableDatabase();d.beginTransaction();try{String[] old=route(sim);if(old==null&&android.database.DatabaseUtils.queryNumEntries(d,"routes")>=5)throw new IllegalStateException("Сохранено 5 SIM-профилей. Сначала удалите старый");ContentValues v=new ContentValues();v.put("sim",sim);v.put("id",old==null?UUID.randomUUID().toString():old[0]);v.put("label",label);v.put("number",number);v.put("recipient",recipient);d.insertWithOnConflict("routes",null,v,SQLiteDatabase.CONFLICT_REPLACE);
        // Changing a rule never sends old messages to a new recipient.
        d.delete("queue","sim=?",new String[]{v.getAsString("id")});d.setTransactionSuccessful();}finally{d.endTransaction();}
    }
    void deleteRoute(String sim){String[] old=route(sim);if(old==null)return;getWritableDatabase().delete("queue","sim=?",new String[]{old[0]});getWritableDatabase().delete("routes","sim=?",new String[]{sim});}
    List<String[]> routes(){List<String[]> out=new ArrayList<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT sim,label,number FROM routes",null)){while(c.moveToNext())out.add(new String[]{c.getString(0),c.getString(1),c.getString(2)});}return out;}
    void enqueue(String sim,String sender,String body,long received) throws Exception {
        SQLiteDatabase d=getWritableDatabase();d.beginTransaction();try{
            String[] route=route(sim);if(route==null||route[3]==null){diagnostic("SIM определена · пересылка выключена: назначьте получателя в SIM и правилах");d.setTransactionSuccessful();return;}
            try(Cursor c=d.rawQuery("SELECT enabled FROM recipients WHERE id=?",new String[]{route[3]})){if(!c.moveToFirst()||c.getInt(0)!=1){diagnostic("Правило найдено · получателю нужна повторная привязка");d.setTransactionSuccessful();return;}}
            List<String> parts=WebPush.chunks(body);if(parts.size()>100)throw new IllegalArgumentException("SMS exceeds 100 push parts");String messageId=UUID.randomUUID().toString();
            for(int i=0;i<parts.size();i++){
                JSONObject m=new JSONObject().put("version",1).put("type","sms").put("id",messageId+"-"+i).put("messageId",messageId).put("partIndex",i).put("partCount",parts.size()).put("sourceId",Identity.source(context)).put("simId",route[0]).put("simName",route[1]).put("sender",sender).put("body",parts.get(i)).put("receivedAt",received);
                if(WebPush.utf(m.toString()).length>3993)throw new IllegalArgumentException("Push payload too large");
                ContentValues v=new ContentValues();v.put("id",m.getString("id"));v.put("recipient",route[3]);v.put("sim",route[0]);v.put("payload",m.toString());v.put("created",System.currentTimeMillis());d.insertOrThrow("queue",null,v);
            }
            diagnostic("SMS принято приложением · SIM и правило определены · частей в очереди: "+parts.size());
            d.execSQL("DELETE FROM queue WHERE id NOT IN (SELECT id FROM queue ORDER BY created DESC LIMIT 1000)");d.setTransactionSuccessful();
        }finally{d.endTransaction();}DeliveryJob.schedule(context);
    }
    void test(String recipient) throws Exception {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT enabled FROM recipients WHERE id=?",new String[]{recipient})){if(!c.moveToFirst()||c.getInt(0)!=1)throw new IllegalStateException("Получателю нужна повторная привязка");}
        JSONObject m=new JSONObject().put("version",1).put("type","sms").put("id",UUID.randomUUID().toString()).put("sourceId",Identity.source(context)).put("simId","test").put("simName","Проверка доставки").put("sender","SMS Bridge").put("body","Это тестовый push с домашнего Android через интернет. Приём SMS для этой проверки не нужен.").put("receivedAt",System.currentTimeMillis());
        ContentValues v=new ContentValues();v.put("id",m.getString("id"));v.put("recipient",recipient);v.put("payload",m.toString());v.put("created",System.currentTimeMillis());getWritableDatabase().insertOrThrow("queue",null,v);DeliveryJob.schedule(context);
    }
    String[] next(){long now=System.currentTimeMillis();getWritableDatabase().delete("queue","created<?",new String[]{""+(now-86400000)});try(Cursor c=getReadableDatabase().rawQuery("SELECT q.id,q.payload,r.subscription,q.attempts FROM queue q JOIN recipients r ON r.id=q.recipient WHERE r.enabled=1 AND q.next<=? ORDER BY q.created LIMIT 1",new String[]{""+now})){return c.moveToFirst()?new String[]{c.getString(0),c.getString(1),c.getString(2),c.getString(3)}:null;}}
    void result(String id,int code,int attempts){SQLiteDatabase d=getWritableDatabase();
        if(code>=200&&code<300){d.delete("queue","id=?",new String[]{id});status("Принято push-сервисом · "+new java.util.Date()+" (это не подтверждение получения клиентом)");}
        else if(code==404||code==410||code==401||code==403){d.execSQL("UPDATE recipients SET enabled=0 WHERE id=(SELECT recipient FROM queue WHERE id=?)",new Object[]{id});d.execSQL("DELETE FROM queue WHERE recipient IN (SELECT id FROM recipients WHERE enabled=0)");status("HTTP "+code+" · нужна повторная привязка получателя");}
        else if(code>=400&&code<500&&code!=408&&code!=429){d.delete("queue","id=?",new String[]{id});status("HTTP "+code+" · push отклонён");}
        else {ContentValues v=new ContentValues();v.put("attempts",attempts+1);v.put("next",System.currentTimeMillis()+Math.min(3600000,30000L*(1L<<Math.min(attempts,7))));d.update("queue",v,"id=?",new String[]{id});status(code==0?"Сеть недоступна · повтор в очереди":"HTTP "+code+" · повтор в очереди");}
    }
    void diagnostic(String text){ContentValues v=new ContentValues();v.put("key","smsDiagnostic");v.put("value",new java.util.Date()+" · "+text);getWritableDatabase().insertWithOnConflict("state",null,v,SQLiteDatabase.CONFLICT_REPLACE);}
    String diagnostic(){try(Cursor c=getReadableDatabase().rawQuery("SELECT value FROM state WHERE key='smsDiagnostic'",null)){return c.moveToFirst()?c.getString(0):"Новых SMS ещё не было";}}
    boolean pending(){return DatabaseUtils.queryNumEntries(getReadableDatabase(),"queue")>0;}
    void status(String text){ContentValues v=new ContentValues();v.put("key","delivery");v.put("value",text);getWritableDatabase().insertWithOnConflict("state",null,v,SQLiteDatabase.CONFLICT_REPLACE);}
    String status(){try(Cursor c=getReadableDatabase().rawQuery("SELECT value FROM state WHERE key='delivery'",null)){return diagnostic()+"\nВ очереди: "+DatabaseUtils.queryNumEntries(getReadableDatabase(),"queue")+"\n"+(c.moveToFirst()?c.getString(0):"Отправок ещё не было");}}
}
