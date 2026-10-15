package dev.kats.smsbridge;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
public class RespondService extends Service {
    public IBinder onBind(Intent i) { return null; }
    public int onStartCommand(Intent i,int flags,int id) {
        Store.notifyReceived(this,"Быстрый SMS-ответ пока не поддерживается");
        stopSelf(id); return START_NOT_STICKY;
    }
}
