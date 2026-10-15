package dev.kats.smsbridge;

import android.content.Context;
import android.security.keystore.*;
import java.security.*;

final class Identity {
    static final String ALIAS="sms-bridge-vapid-v1";
    static synchronized KeyStore store() throws Exception {
        KeyStore k=KeyStore.getInstance("AndroidKeyStore");k.load(null);
        if(!k.containsAlias(ALIAS)){
            KeyPairGenerator g=KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC,"AndroidKeyStore");
            g.initialize(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_SIGN|KeyProperties.PURPOSE_VERIFY).setAlgorithmParameterSpec(new java.security.spec.ECGenParameterSpec("secp256r1")).setDigests(KeyProperties.DIGEST_SHA256).build());g.generateKeyPair();
        }return k;
    }
    static PrivateKey privateKey() throws Exception{return (PrivateKey)store().getKey(ALIAS,null);}
    static PublicKey publicKey() throws Exception{return store().getCertificate(ALIAS).getPublicKey();}
    static String source(Context c){android.content.SharedPreferences p=c.getSharedPreferences("identity",0);synchronized(Identity.class){String id=p.getString("source",null);if(id==null){id=java.util.UUID.randomUUID().toString();if(!p.edit().putString("source",id).commit())throw new IllegalStateException("Не удалось сохранить идентификатор");}return id;}}
}
