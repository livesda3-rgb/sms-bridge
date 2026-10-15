package dev.kats.smsbridge;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import android.app.*;
import android.os.Build;
import java.text.DateFormat;
import java.util.Date;

final class Store extends SQLiteOpenHelper {
    Store(Context c) { super(c, "diagnostic.db", null, 1); }
    public void onCreate(SQLiteDatabase d) {
        d.execSQL("CREATE TABLE events (_id INTEGER PRIMARY KEY AUTOINCREMENT, received INTEGER, sender TEXT, body TEXT, sub INTEGER, detail TEXT)");
    }
    public void onUpgrade(SQLiteDatabase d, int a, int b) { }
    synchronized void add(String sender, String body, int sub, String detail) {
        ContentValues v=new ContentValues();
        v.put("received",System.currentTimeMillis()); v.put("sender",sender);
        v.put("body",body); v.put("sub",sub); v.put("detail",detail);
        getWritableDatabase().insertOrThrow("events",null,v);
        getWritableDatabase().execSQL("DELETE FROM events WHERE _id NOT IN (SELECT _id FROM events ORDER BY _id DESC LIMIT 100)");
    }
    String display() {
        StringBuilder b=new StringBuilder();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT received,sender,body,sub,detail FROM events ORDER BY _id DESC LIMIT 30",null)) {
            while(c.moveToNext()) b.append(DateFormat.getDateTimeInstance().format(new Date(c.getLong(0))))
                .append(" · subId=").append(c.getInt(3)).append("\n")
                .append(c.getString(1)).append("\n").append(c.getString(2))
                .append("\n").append(c.getString(4)).append("\n\n────────────\n\n");
        }
        return b.length()==0 ? "Пока нет новых SMS. Здесь появятся сообщения, полученные после назначения приложения основным." : b.toString();
    }
    static void notifyReceived(Context c, String title) {
        NotificationManager n=c.getSystemService(NotificationManager.class);
        n.createNotificationChannel(new NotificationChannel("sms", "Входящие SMS", NotificationManager.IMPORTANCE_HIGH));
        if(Build.VERSION.SDK_INT>=33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=0) return;
        PendingIntent pi=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        n.notify(1,new Notification.Builder(c,"sms").setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(title).setContentText("Откройте SMS Bridge для просмотра.")
            .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(pi).setAutoCancel(true).build());
    }
}
