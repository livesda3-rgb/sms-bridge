package dev.kats.smsbridge;
import android.content.Context;
import android.telephony.*;
final class SimIdentity {
    static String key(SubscriptionInfo info){
        // ICCID can be unavailable even to the default SMS app. Never substitute slot number.
        try{String icc=info.getIccId();if(icc!=null&&icc.matches("[0-9]{18,22}")&&!icc.matches("0+"))return "icc:"+BridgeStore.digest(icc);}catch(Exception ignored){}
        return "sub:"+info.getSubscriptionId();
    }
    static String key(Context c,int sub){if(sub<0)return null;try{SubscriptionInfo i=c.getSystemService(SubscriptionManager.class).getActiveSubscriptionInfo(sub);return i==null?null:key(i);}catch(SecurityException e){return null;}}
}
