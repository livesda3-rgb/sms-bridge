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
import org.json.*;

public class MainActivity extends Activity {
    private TextView status, log, delivery;
    private LinearLayout routing;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Runnable refresh=new Runnable(){ public void run(){ render(); handler.postDelayed(this,2000); }};
    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density);}
    private TextView text(String s,int size){ TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setPadding(0,dp(8),0,dp(8));return t; }
    private void button(LinearLayout root,String label,Runnable action){Button b=new Button(this);b.setText(label);b.setOnClickListener(v->action.run());root.addView(b);}
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        ScrollView scroll=new ScrollView(this); LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(20),dp(28),dp(20),dp(20));scroll.addView(root);setContentView(scroll);
        root.addView(text("SMS Bridge",28));
        root.addView(text("0.4 · SMS → Web Push",16));
        root.addView(text("Принимает SMS и отправляет их выбранному получателю через интернет. Для каждой SIM включите пересылку отдельно. MMS и отправка исходящих SMS не поддерживаются. После перезагрузки нужно один раз разблокировать телефон.",14));
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
        root.addView(text("Получатели и пересылка",22));
        button(root,"1. Показать QR подключения (15 минут)",this::invite);
        button(root,"2. Сканировать ответный QR с iPhone",this::scanRecipient);
        button(root,"Вставить данные вручную",this::importRecipient);
        delivery=text("",14);root.addView(delivery);
        routing=new LinearLayout(this);routing.setOrientation(LinearLayout.VERTICAL);root.addView(routing);
        button(root,"Обновить SIM и правила",this::renderRoutes);
        root.addView(text("Новые сообщения",22));log=text("",15);log.setTextIsSelectable(true);root.addView(log);
        renderRoutes();
        if(Intent.ACTION_SENDTO.equals(getIntent().getAction())) new AlertDialog.Builder(this).setTitle("Только приём SMS").setMessage("Отправка SMS в этой диагностической сборке не реализована. Верните прежнее SMS-приложение для отправки.").setPositiveButton("Понятно",null).show();
    }
    @Override protected void onResume(){super.onResume();handler.post(refresh);if(routing!=null)renderRoutes();try(BridgeStore b=new BridgeStore(this)){if(b.pending())DeliveryJob.schedule(this);}}
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
        if(delivery!=null)try(BridgeStore b=new BridgeStore(this)){delivery.setText(b.status());}
        try(Store db=new Store(this)){log.setText(db.display());}
    }
    private void fail(Exception e){new AlertDialog.Builder(this).setTitle("Не удалось выполнить").setMessage(e.getMessage()==null?e.getClass().getSimpleName():e.getMessage()).setPositiveButton("Понятно",null).show();}
    private EditText input(String hint,String value){EditText e=new EditText(this);e.setHint(hint);e.setText(value);return e;}
    private void invite(){try(BridgeStore b=new BridgeStore(this)){
        JSONObject invitation=b.invite();String data=invitation.toString();
        com.google.zxing.common.BitMatrix matrix=new com.google.zxing.qrcode.QRCodeWriter().encode(data,com.google.zxing.BarcodeFormat.QR_CODE,800,800,Collections.singletonMap(com.google.zxing.EncodeHintType.CHARACTER_SET,"UTF-8"));
        android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(800,800,android.graphics.Bitmap.Config.RGB_565);
        for(int y=0;y<800;y++)for(int x=0;x<800;x++)bitmap.setPixel(x,y,matrix.get(x,y)?android.graphics.Color.BLACK:android.graphics.Color.WHITE);
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(12),0,dp(12),0);
        ImageView image=new ImageView(this);image.setImageBitmap(bitmap);image.setAdjustViewBounds(true);box.addView(image,new LinearLayout.LayoutParams(-1,-2));
        TextView countdown=text("",14);box.addView(countdown);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Сканируйте из SMS Bridge на iPhone").setMessage("На iPhone нажмите «Сканировать QR с Android», затем подключите уведомления. Ответный QR покажите камере этого телефона.").setView(box).setPositiveButton("Сканировать ответный QR",(d,w)->scanRecipient()).setNeutralButton("Скопировать текст",(d,w)->((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("SMS Bridge",data))).setNegativeButton("Закрыть",null).create();
        long expiry=invitation.getLong("expiresAt");
        Runnable timer=new Runnable(){public void run(){long seconds=Math.max(0,(expiry-System.currentTimeMillis())/1000);countdown.setText(seconds>0?"Осталось: "+seconds/60+":"+String.format(java.util.Locale.ROOT,"%02d",seconds%60):"Срок истёк. Закройте и создайте новый QR.");if(seconds==0)image.setVisibility(android.view.View.GONE);else if(dialog.isShowing())handler.postDelayed(this,1000);}};
        dialog.setOnDismissListener(d->handler.removeCallbacks(timer));dialog.show();timer.run();
    }catch(Exception e){fail(e);}}
    private void scanRecipient(){
        new com.google.zxing.integration.android.IntentIntegrator(this).setCaptureActivity(QrCaptureActivity.class).setDesiredBarcodeFormats(com.google.zxing.integration.android.IntentIntegrator.QR_CODE).setPrompt("Наведите камеру на ответный QR в SMS Bridge на iPhone").setBeepEnabled(false).setBarcodeImageEnabled(false).setOrientationLocked(false).initiateScan();
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        com.google.zxing.integration.android.IntentResult result=com.google.zxing.integration.android.IntentIntegrator.parseActivityResult(requestCode,resultCode,data);
        if(result!=null){if(result.getContents()!=null)confirmRecipient(result.getContents());return;}
        super.onActivityResult(requestCode,resultCode,data);
    }
    private void confirmRecipient(String raw){try(BridgeStore b=new BridgeStore(this)){
        JSONObject r=b.validateRecipient(raw);
        new AlertDialog.Builder(this).setTitle("Разрешить подключение?").setMessage("Получатель: "+r.getString("name")+"\nPush-сервис: "+WebPush.endpoint(r.getJSONObject("subscription").getString("endpoint")).getHost()+"\n\nПосле подтверждения выберите «Настроить SIM» и назначьте этого получателя.").setPositiveButton("Разрешить",(d,w)->{try(BridgeStore db=new BridgeStore(this)){db.approve(raw);renderRoutes();Toast.makeText(this,"Получатель добавлен. Настройте SIM и отправьте тестовый push.",Toast.LENGTH_LONG).show();}catch(Exception e){fail(e);}}).setNegativeButton("Отмена",null).show();
    }catch(Exception e){fail(e);}}
    private void importRecipient(){EditText v=input("Вставьте JSON получателя","");v.setMinLines(4);v.setMaxLines(10);
        new AlertDialog.Builder(this).setTitle("Добавить получателя вручную").setView(v).setPositiveButton("Проверить",(d,w)->confirmRecipient(v.getText().toString())).setNegativeButton("Отмена",null).show();
    }
    private void renderRoutes(){
        routing.removeAllViews();try(BridgeStore b=new BridgeStore(this)){
            for(String[] r:b.recipients()){
                routing.addView(text(r[1]+" · "+r[2],16));
                button(routing,"Отправить тестовый push → "+r[1],()->{try(BridgeStore db=new BridgeStore(this)){db.test(r[0]);Toast.makeText(this,"Тест добавлен в очередь",Toast.LENGTH_SHORT).show();}catch(Exception e){fail(e);}});
                button(routing,"Отозвать доступ: "+r[1],()->new AlertDialog.Builder(this).setTitle("Удалить получателя?").setMessage("Новые SMS и сообщения в очереди больше не будут ему отправляться. Уже отправленные пуши отозвать невозможно.").setPositiveButton("Удалить",(d,w)->{try(BridgeStore db=new BridgeStore(this)){db.revoke(r[0]);}renderRoutes();}).setNegativeButton("Отмена",null).show());
            }
            if(checkSelfPermission(Manifest.permission.READ_PHONE_STATE)==0){List<SubscriptionInfo> sims=getSystemService(SubscriptionManager.class).getActiveSubscriptionInfoList();if(sims!=null)for(SubscriptionInfo sim:sims){String key=SimIdentity.key(sim);String[] rule=b.route(key);String title="SIM "+(sim.getSimSlotIndex()+1)+" · "+sim.getDisplayName();routing.addView(text(title+"\n"+(rule==null||rule[3]==null?"Пересылка выключена":rule[1]+" · правило назначено"),15));button(routing,"Настроить "+title,()->editRoute(key,title));}}
            for(String[] r:b.routes())button(routing,"Удалить профиль SIM: "+r[1],()->new AlertDialog.Builder(this).setTitle("Удалить профиль и правило?").setPositiveButton("Удалить",(d,w)->{try(BridgeStore db=new BridgeStore(this)){db.deleteRoute(r[0]);}renderRoutes();}).setNegativeButton("Отмена",null).show());
            routing.addView(text("До 5 сохранённых SIM. Если Android скрывает идентификатор SIM, привязка использует subId: после замены, сброса телефона или удаления eSIM может потребоваться заново назначить правило. По одному слоту SIM не узнаём.",12));
        }catch(Exception e){fail(e);}
    }
    private void editRoute(String key,String title){try(BridgeStore b=new BridgeStore(this)){
        String[] old=b.route(key);List<String[]> recipients=b.recipients();LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(20),0,dp(20),0);
        EditText name=input("Имя SIM",old==null?title:old[1]),number=input("Номер SIM (вручную)",old==null?"":old[2]);name.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(80)});number.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(40)});number.setInputType(android.text.InputType.TYPE_CLASS_PHONE);box.addView(name);box.addView(number);
        Spinner choices=new Spinner(this);List<String> labels=new ArrayList<>();labels.add("Пересылка выключена");int selected=0;for(String[] r:recipients){labels.add(r[1]+" · "+r[2]);if(old!=null&&r[0].equals(old[3]))selected=labels.size()-1;}choices.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels));choices.setSelection(selected);box.addView(choices);
        AlertDialog d=new AlertDialog.Builder(this).setTitle(title).setView(box).setPositiveButton("Сохранить",null).setNegativeButton("Отмена",null).create();d.setOnShowListener(x->d.getButton(-1).setOnClickListener(y->{try(BridgeStore db=new BridgeStore(this)){String label=name.getText().toString().trim();if(label.isEmpty())throw new IllegalArgumentException("Укажите имя SIM");int i=choices.getSelectedItemPosition();db.route(key,label,number.getText().toString(),i==0?null:recipients.get(i-1)[0]);d.dismiss();renderRoutes();}catch(Exception e){fail(e);}}));d.show();
    }catch(Exception e){fail(e);}}

}
