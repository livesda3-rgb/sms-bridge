package dev.kats.smsbridge;
import android.content.*;
public class MmsReceiver extends BroadcastReceiver {
    public void onReceive(Context c, Intent i) {
        if(!"android.provider.Telephony.WAP_PUSH_DELIVER".equals(i.getAction())) return;
        try(Store s=new Store(c)) {
            s.add("MMS", "Получено уведомление MMS. Диагностическая версия не загружает MMS. Верните обычное SMS-приложение для повседневного использования.",-1,"MMS не поддерживается");
        }
        Store.notifyReceived(c,"MMS не поддерживается в тестовой версии");
    }
}
