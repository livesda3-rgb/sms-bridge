package dev.kats.smsbridge;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
public class QrPartsCheck {
    private static void reject(QrParts q,String s)throws Exception{
        try{q.accept(s);}catch(IllegalArgumentException expected){return;}
        throw new AssertionError("Invalid frame accepted");
    }
    public static void main(String[] args)throws Exception{
        List<String> frames=Files.readAllLines(Paths.get(args[0]),StandardCharsets.UTF_8);
        QrParts q=new QrParts();String full=null;
        for(int i=frames.size()-1;i>=0;i--){full=q.accept(frames.get(i));q.accept(frames.get(i));}
        if(full==null||q.received()!=frames.size())throw new AssertionError("Incomplete assembly");
        QrParts mixed=new QrParts();mixed.accept(frames.get(0));
        reject(mixed,frames.get(0).replaceFirst("SBQR1\\|.","SBQR1|"+(frames.get(0).charAt(6)=='0'?'1':'0')));
        reject(new QrParts(),"SBQR1|"+"a".repeat(64)+"|0|99|abc");
        reject(new QrParts(),"SBQR1|"+"a".repeat(64)+"|1|1|abc");
        reject(new QrParts(),"SBQR1|"+"a".repeat(64)+"|0|1|"+"b".repeat(241));
        reject(new QrParts(),"SBQR1|"+"a".repeat(64)+"|0|1|tampered");
        QrParts conflict=new QrParts();conflict.accept(frames.get(0));reject(conflict,frames.get(0)+"x");
        if(!"{}".equals(new QrParts().accept("{}")))throw new AssertionError("Legacy broken");
        System.out.print(full);
    }
}
