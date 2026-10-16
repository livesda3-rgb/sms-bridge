package dev.kats.smsbridge;

import android.content.*;
import android.net.Uri;
import android.provider.Telephony;
import android.telephony.*;

public class SmsReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if(!Telephony.Sms.Intents.SMS_DELIVER_ACTION.equals(intent.getAction())) return;
        if(!context.getPackageName().equals(Telephony.Sms.getDefaultSmsPackage(context))) return;
        PendingResult pending=goAsync();
        new Thread(() -> {
            try(Store db=new Store(context)) {
                SmsMessage[] parts=Telephony.Sms.Intents.getMessagesFromIntent(intent);
                if(parts==null || parts.length==0) return;
                String sender=parts[0].getOriginatingAddress();
                if(sender==null) sender="Неизвестный отправитель";
                StringBuilder body=new StringBuilder();
                for(SmsMessage part:parts) if(part.getMessageBody()!=null) body.append(part.getMessageBody());
                int sub=intent.getIntExtra(SubscriptionManager.EXTRA_SUBSCRIPTION_INDEX,-1);
                if(sub<0) sub=intent.getIntExtra("subscription",-1);
                int slot=intent.getIntExtra(SubscriptionManager.EXTRA_SLOT_INDEX,-1);
                if(slot<0) slot=intent.getIntExtra("slot",-1);
                String detail="Частей: "+parts.length+"; слот: "+(slot<0 ? "не определён" : Integer.toString(slot+1));
                try {
                    ContentValues v=new ContentValues();
                    v.put(Telephony.Sms.ADDRESS,sender); v.put(Telephony.Sms.BODY,body.toString());
                    v.put(Telephony.Sms.DATE,System.currentTimeMillis());
                    v.put(Telephony.Sms.DATE_SENT,parts[0].getTimestampMillis());
                    v.put(Telephony.Sms.READ,0); v.put(Telephony.Sms.SEEN,0);
                    if(sub>=0) v.put(Telephony.Sms.SUBSCRIPTION_ID,sub);
                    if(parts[0].getServiceCenterAddress()!=null) v.put(Telephony.Sms.SERVICE_CENTER,parts[0].getServiceCenterAddress());
                    Uri saved=context.getContentResolver().insert(Telephony.Sms.Inbox.CONTENT_URI,v);
                    detail += saved!=null ? "; сохранено в SMS-базе" : "; ОШИБКА сохранения в SMS-базе";
                } catch(Exception e) { detail+="; SMS-база: "+e.getClass().getSimpleName(); }
                db.add(sender,body.toString(),sub,detail);
                String simKey=SimIdentity.key(context,sub);
                try(BridgeStore bridge=new BridgeStore(context)){
                    if(simKey==null){bridge.diagnostic("SMS принято приложением · SIM не определена (subId="+sub+") · пересылка не выполнена");}
                    else
                    try { bridge.enqueue(simKey,sender,body.toString(),System.currentTimeMillis()); }
                    catch(Exception e){bridge.status("Ошибка постановки SMS в очередь: "+e.getClass().getSimpleName());}
                }
                Store.notifyReceived(context,"Получено SMS");
            } finally { pending.finish(); }
        },"sms-persist").start();
    }
}
