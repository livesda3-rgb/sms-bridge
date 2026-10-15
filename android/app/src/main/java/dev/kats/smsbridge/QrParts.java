package dev.kats.smsbridge;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Bounded in-memory assembly. Integrity is checked before normal pairing authorization. */
public final class QrParts {
    private String id;
    private String[] parts;
    private int received;
    public int received(){return received;}
    public int total(){return parts==null?0:parts.length;}
    public String accept(String text) throws Exception {
        if(text==null||text.length()>16000)throw new IllegalArgumentException("Некорректный QR");
        if(!text.startsWith("SBQR1|")){
            if(text.trim().startsWith("{"))return text; // Legacy single QR; validated by BridgeStore.
            throw new IllegalArgumentException("Это не код SMS Bridge");
        }
        String[] fields=text.split("\\|",5);
        if(fields.length!=5||!fields[1].matches("[0-9a-f]{64}")||!fields[2].matches("[0-9]{1,2}")||!fields[3].matches("[0-9]{1,2}"))throw new IllegalArgumentException("Некорректная часть QR");
        int index=Integer.parseInt(fields[2]),count=Integer.parseInt(fields[3]);
        if(count<1||count>67||index<0||index>=count||fields[4].length()<1||fields[4].length()>240)throw new IllegalArgumentException("Некорректный размер QR");
        if(id!=null&&!id.equals(fields[1]))throw new IllegalArgumentException("Другой код. Закройте сканер и откройте снова");
        if(parts!=null&&parts.length!=count)throw new IllegalArgumentException("Несовместимые части QR");
        if(parts==null){id=fields[1];parts=new String[count];}
        if(parts[index]!=null&&!parts[index].equals(fields[4]))throw new IllegalArgumentException("Повреждённая часть QR");
        if(parts[index]==null){parts[index]=fields[4];received++;}
        if(received!=count)return null;
        StringBuilder full=new StringBuilder();for(String p:parts)full.append(p);
        String data=full.toString();
        if(data.length()>16000)throw new IllegalArgumentException("Данные QR слишком велики");
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(data.getBytes(StandardCharsets.UTF_8));
        StringBuilder actual=new StringBuilder();for(byte b:digest)actual.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        if(!id.equals(actual.toString())){id=null;parts=null;received=0;throw new IllegalArgumentException("QR повреждён. Сканируйте ещё раз");}
        return data;
    }
}
