package dev.kats.smsbridge;

import android.Manifest;
import android.app.*;
import android.app.role.RoleManager;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.provider.*;
import android.telephony.*;
import android.widget.*;
import java.util.*;

public class MainActivity extends Activity {
    private TextView status, log;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Runnable refresh=new Runnable(){ public void run(){ render(); handler.postDelayed(this,2000); }};
    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density);}
    private TextView text(String s,int size){ TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setPadding(0,dp(8),0,dp(8));return t; }
    private void button(LinearLayout root,String label,Runnable action){Button b=new Button(this);b.setText(label);b.setOnClickListener(v->action.run());root.addView(b);}
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        ScrollView scroll=new ScrollView(this); LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(20),dp(28),dp(20),dp(20));scroll.addView(root);setContentView(scroll);
        root.addView(text("SMS Bridge",28));
        root.addView(text("0.1 · проверка приёма SMS",16));
        root.addView(text("Эта сборка сохраняет входящие SMS на телефоне. Интернет-пересылки, пароля и правил пока нет. MMS и отправка SMS не поддерживаются. Назначайте основным только на время теста; затем верните прежнее приложение.",14));
        status=text("",14);root.addView(status);
        button(root,"1. Назначить основным SMS-приложением",()->{
            RoleManager rm=getSystemService(RoleManager.class);
            if(rm.isRoleAvailable(RoleManager.ROLE_SMS)) startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_SMS),10);
        });
        button(root,"2. Выдать разрешения",()->{
            ArrayList<String> permissions=new ArrayList<>(Arrays.asList(Manifest.permission.READ_SMS,Manifest.permission.RECEIVE_SMS,Manifest.permission.READ_PHONE_STATE));
            if(Build.VERSION.SDK_INT>=33) permissions.add(Manifest.permission.POST_NOTIFICATIONS);
            permissions.removeIf(p->checkSelfPermission(p)==PackageManager.PERMISSION_GRANTED);
            if(!permissions.isEmpty()) requestPermissions(permissions.toArray(new String[0]),11);
            else Toast.makeText(this,"Разрешения уже выданы",Toast.LENGTH_SHORT).show();
        });
        button(root,"Настройки приложения / батареи",()->startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:"+getPackageName()))));
        button(root,"Вернуть прежнее SMS-приложение",()->startActivity(new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS)));
        button(root,"Обновить",this::render);
        root.addView(text("Новые сообщения",22));log=text("",15);log.setTextIsSelectable(true);root.addView(log);
        if(Intent.ACTION_SENDTO.equals(getIntent().getAction())) new AlertDialog.Builder(this).setTitle("Только приём SMS").setMessage("Отправка SMS в этой диагностической сборке не реализована. Верните прежнее SMS-приложение для отправки.").setPositiveButton("Понятно",null).show();
    }
    @Override protected void onResume(){super.onResume();handler.post(refresh);}
    @Override protected void onPause(){handler.removeCallbacks(refresh);super.onPause();}
    private void render(){
        boolean def=getPackageName().equals(Telephony.Sms.getDefaultSmsPackage(this));
        StringBuilder s=new StringBuilder("Основное SMS-приложение: "+(def ? "ДА" : "НЕТ")+"\nAndroid "+Build.VERSION.RELEASE+"\n");
        for(String p:new String[]{Manifest.permission.RECEIVE_SMS,Manifest.permission.READ_SMS,Manifest.permission.READ_PHONE_STATE}) s.append(p.substring(p.lastIndexOf('.')+1)).append(": ").append(checkSelfPermission(p)==0 ? "да" : "нет").append("\n");
        if(checkSelfPermission(Manifest.permission.READ_PHONE_STATE)==0){
            try {
                List<SubscriptionInfo> sims=getSystemService(SubscriptionManager.class).getActiveSubscriptionInfoList();
                if(sims==null||sims.isEmpty()) s.append("Активные SIM не найдены\n");
                else for(SubscriptionInfo sim:sims) s.append("SIM ").append(sim.getSimSlotIndex()+1).append(" · ").append(sim.getDisplayName()).append(" · subId=").append(sim.getSubscriptionId()).append("\n");
            }catch(SecurityException e){s.append("Нет доступа к списку SIM\n");}
        }
        status.setText(s);
        try(Store db=new Store(this)){log.setText(db.display());}
    }
}
