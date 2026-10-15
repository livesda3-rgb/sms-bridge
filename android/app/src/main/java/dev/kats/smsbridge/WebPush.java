package dev.kats.smsbridge;

import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.*;
import java.math.BigInteger;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import javax.net.ssl.HttpsURLConnection;

/** RFC 8291 aes128gcm (one record) and RFC 8292 VAPID. No service SDK. */
final class WebPush {
    static final SecureRandom RANDOM=new SecureRandom();
    static byte[] utf(String s){return s.getBytes(StandardCharsets.UTF_8);}
    static String b64(byte[] b){return Base64.getUrlEncoder().withoutPadding().encodeToString(b);}
    static byte[] un64(String s){return Base64.getUrlDecoder().decode(s);}
    static byte[] join(byte[]... values){ByteArrayOutputStream b=new ByteArrayOutputStream();for(byte[] v:values)b.write(v,0,v.length);return b.toByteArray();}
    static byte[] random(int n){byte[] b=new byte[n];RANDOM.nextBytes(b);return b;}
    static KeyPair pair() throws GeneralSecurityException {KeyPairGenerator g=KeyPairGenerator.getInstance("EC");g.initialize(new ECGenParameterSpec("secp256r1"));return g.generateKeyPair();}
    static byte[] unsigned(BigInteger n){byte[] b=n.toByteArray(),out=new byte[32];System.arraycopy(b,Math.max(0,b.length-32),out,Math.max(0,32-b.length),Math.min(32,b.length));return out;}
    static byte[] point(PublicKey key){ECPublicKey k=(ECPublicKey)key;return join(new byte[]{4},unsigned(k.getW().getAffineX()),unsigned(k.getW().getAffineY()));}
    static PublicKey publicKey(byte[] raw) throws GeneralSecurityException {
        if(raw.length!=65||raw[0]!=4)throw new InvalidKeyException("P-256 key");
        AlgorithmParameters p=AlgorithmParameters.getInstance("EC");p.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec spec=p.getParameterSpec(ECParameterSpec.class);
        BigInteger x=new BigInteger(1,Arrays.copyOfRange(raw,1,33)),y=new BigInteger(1,Arrays.copyOfRange(raw,33,65));
        BigInteger prime=((ECFieldFp)spec.getCurve().getField()).getP();
        if(x.compareTo(prime)>=0||y.compareTo(prime)>=0||!y.multiply(y).mod(prime).equals(x.pow(3).add(spec.getCurve().getA().multiply(x)).add(spec.getCurve().getB()).mod(prime)))throw new InvalidKeyException("Point is not on P-256");
        return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(x,y),spec));
    }
    static byte[] mac(byte[] key,byte[] data) throws GeneralSecurityException {Mac m=Mac.getInstance("HmacSHA256");m.init(new SecretKeySpec(key,"HmacSHA256"));return m.doFinal(data);}
    static byte[] expand(byte[] key,byte[] info,int n) throws GeneralSecurityException {return Arrays.copyOf(mac(key,join(info,new byte[]{1})),n);}
    static List<String> chunks(String body){List<String> out=new ArrayList<>();StringBuilder b=new StringBuilder();int size=0;for(int i=0;i<body.length();){int cp=body.codePointAt(i);String s=new String(Character.toChars(cp));int bytes=WebPush.utf(s).length; // worst case JSON escaping: controls take 6 bytes
            bytes=Math.max(bytes,cp<32?6:cp=='"'||cp=='\\'?2:bytes);
            if(size+bytes>2000){out.add(b.toString());b.setLength(0);size=0;}b.append(s);size+=bytes;i+=Character.charCount(cp);}if(b.length()>0||out.isEmpty())out.add(b.toString());return out;}
    static byte[] encrypt(byte[] ua,byte[] auth,byte[] plain) throws GeneralSecurityException {
        if(plain.length>3993||auth.length!=16)throw new InvalidKeyException("Payload or auth length");
        KeyPair sender=pair();return encrypt(ua,auth,plain,sender,random(16));
    }
    static byte[] encrypt(byte[] ua,byte[] auth,byte[] plain,KeyPair sender,byte[] salt) throws GeneralSecurityException {
        byte[] as=point(sender.getPublic());KeyAgreement ecdh=KeyAgreement.getInstance("ECDH");ecdh.init(sender.getPrivate());ecdh.doPhase(publicKey(ua),true);
        byte[] prkKey=mac(auth,ecdh.generateSecret());
        byte[] ikm=expand(prkKey,join(utf("WebPush: info\0"),ua,as),32);
        byte[] prk=mac(salt,ikm),cek=expand(prk,utf("Content-Encoding: aes128gcm\0"),16),nonce=expand(prk,utf("Content-Encoding: nonce\0"),12);
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(cek,"AES"),new GCMParameterSpec(128,nonce));
        return join(salt,ByteBuffer.allocate(4).putInt(4096).array(),new byte[]{65},as,c.doFinal(join(plain,new byte[]{2})));
    }
    // Java/Android ECDSA emits ASN.1 DER; JWT requires fixed width R || S.
    static byte[] jose(byte[] der) throws GeneralSecurityException {
        try{int i=2;if(der[0]!=0x30||der[i++]!=2)throw new IllegalArgumentException();int nr=der[i++]&255;byte[] r=Arrays.copyOfRange(der,i,i+nr);i+=nr;if(der[i++]!=2)throw new IllegalArgumentException();int ns=der[i++]&255;byte[] s=Arrays.copyOfRange(der,i,i+ns);return join(unsigned(new BigInteger(1,r)),unsigned(new BigInteger(1,s)));}catch(Exception e){throw new GeneralSecurityException("ECDSA signature",e);}
    }
    static URI endpoint(String s) throws Exception {
        URI u=new URI(s);String h=u.getHost();
        boolean allowed=h!=null&&(h.equals("fcm.googleapis.com")||h.equals("updates.push.services.mozilla.com")||h.equals("push.services.mozilla.com")||h.endsWith(".push.apple.com"));
        if(!allowed||!"https".equals(u.getScheme())||(u.getPort()!=-1&&u.getPort()!=443)||u.getUserInfo()!=null||u.getFragment()!=null||s.length()>4096)throw new IllegalArgumentException("Разрешены только HTTPS-адреса push Apple, Google или Mozilla");return u;
    }
    static String authorization(URI endpoint,PrivateKey key,PublicKey pub,long now) throws Exception {
        String origin="https://"+endpoint.getHost();
        String header=b64(utf("{\"typ\":\"JWT\",\"alg\":\"ES256\"}"));
        String claims=b64(utf("{\"aud\":\""+origin+"\",\"exp\":"+(now+3600)+",\"sub\":\"https://livesda3-rgb.github.io/sms-bridge/\"}"));
        String data=header+"."+claims;Signature sign=Signature.getInstance("SHA256withECDSA");sign.initSign(key);sign.update(utf(data));
        return "vapid t="+data+"."+b64(jose(sign.sign()))+", k="+b64(point(pub));
    }
    static int send(String endpoint,String p256dh,String auth,String payload,PrivateKey key,PublicKey pub) throws Exception {
        URI u=endpoint(endpoint);byte[] body=encrypt(un64(p256dh),un64(auth),utf(payload));
        HttpsURLConnection c=(HttpsURLConnection)u.toURL().openConnection();
        try{c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setRequestMethod("POST");c.setDoOutput(true);c.setFixedLengthStreamingMode(body.length);
            c.setRequestProperty("Content-Type","application/octet-stream");c.setRequestProperty("Content-Encoding","aes128gcm");c.setRequestProperty("TTL","86400");c.setRequestProperty("Urgency","high");c.setRequestProperty("Authorization",authorization(u,key,pub,System.currentTimeMillis()/1000));
            try(OutputStream out=c.getOutputStream()){out.write(body);}return c.getResponseCode();
        }finally{c.disconnect();}
    }
}
