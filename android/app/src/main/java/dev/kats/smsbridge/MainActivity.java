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
    private LinearLayout routing, root, toolsPanel, diagnosticsPanel;
    private String page="home";
    private static final String CLIENT_URL="https://livesda3-rgb.github.io/sms-bridge/";
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Runnable refresh=new Runnable(){ public void run(){ render(); handler.postDelayed(this,2000); }};
    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density);}
    private TextView text(String s,int size){ TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setPadding(0,dp(8),0,dp(8));return t; }
    private void button(LinearLayout root,String label,Runnable action){Button b=new Button(this);b.setText(label);b.setOnClickListener(v->action.run());root.addView(b);}
    @Override public void onCreate(Bundle state){
        setTheme(isDark()?android.R.style.Theme_Material_NoActionBar:android.R.style.Theme_Material_Light_NoActionBar);
        super.onCreate(state);
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        ScrollView scroll=new ScrollView(this); root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(20),dp(28),dp(20),dp(20));scroll.addView(root);setContentView(scroll);
        root.addView(text("↗  SMS Bridge · сервер",26));
        button(root,"☰  Меню",this::menu);
        root.addView(text("0.5.1 · SMS → Web Push",14));
        toolsPanel=new LinearLayout(this);toolsPanel.setOrientation(LinearLayout.VERTICAL);root.addView(toolsPanel);toolsPanel.setVisibility(android.view.View.GONE);
        toolsPanel.addView(text("Принимает SMS и отправляет их выбранному получателю через интернет. Для каждой SIM включите пересылку отдельно. MMS и отправка исходящих SMS не поддерживаются. После перезагрузки нужно один раз разблокировать телефон.",14));
        status=text("",14);toolsPanel.addView(status);
        button(toolsPanel,"1. Назначить основным SMS-приложением",()->{
            RoleManager rm=getSystemService(RoleManager.class);
            if(rm.isRoleAvailable(RoleManager.ROLE_SMS)) startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_SMS),10);
        });
        button(toolsPanel,"2. Выдать разрешения",()->{
            ArrayList<String> permissions=new ArrayList<>(Arrays.asList(Manifest.permission.READ_SMS,Manifest.permission.RECEIVE_SMS,Manifest.permission.READ_PHONE_STATE));
            if(Build.VERSION.SDK_INT>=33) permissions.add(Manifest.permission.POST_NOTIFICATIONS);
            permissions.removeIf(p->checkSelfPermission(p)==PackageManager.PERMISSION_GRANTED);
            if(!permissions.isEmpty()) requestPermissions(permissions.toArray(new String[0]),11);
            else Toast.makeText(this,"Разрешения уже выданы",Toast.LENGTH_SHORT).show();
        });
        button(toolsPanel,"Настройки приложения / батареи",()->startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:"+getPackageName()))));
        button(toolsPanel,"Вернуть прежнее SMS-приложение",()->startActivity(new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS)));
        button(toolsPanel,"Обновить",this::render);
        root.addView(text("Подключения",22));
        delivery=text("",14);root.addView(delivery);
        routing=new LinearLayout(this);routing.setOrientation(LinearLayout.VERTICAL);root.addView(routing);
        
        diagnosticsPanel=new LinearLayout(this);diagnosticsPanel.setOrientation(LinearLayout.VERTICAL);root.addView(diagnosticsPanel);diagnosticsPanel.setVisibility(android.view.View.GONE);diagnosticsPanel.addView(text("Диагностика SMS",22));diagnosticsPanel.addView(text("Получение приложением → определение SIM → правило → очередь → push-сервис. Подтверждение доставки клиентом пока не реализовано. Тестовый push не проверяет приём SMS.",14));log=text("",15);log.setTextIsSelectable(true);diagnosticsPanel.addView(log);
        renderRoutes();
        if(!getPreferences(MODE_PRIVATE).getBoolean("introSeen",false))new AlertDialog.Builder(this).setTitle("Домашний телефон для SMS").setMessage("1. В настройках назначьте SMS Bridge основным SMS-приложением и выдайте разрешения.\n2. Установите клиент через QR из меню.\n3. Добавьте подключение и назначьте получателя каждой SIM. Без правила SMS не пересылаются.").setPositiveButton("Понятно",(d,w)->getPreferences(MODE_PRIVATE).edit().putBoolean("introSeen",true).apply()).show();
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
    private boolean isDark(){return (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_YES;}
    private void menu(){String[] items={"Подключения","Добавить подключение","Установить клиент · QR","SIM и правила пересылки","Диагностика","Настройки приложения","О приложении"};new AlertDialog.Builder(this).setTitle("SMS Bridge").setItems(items,(d,i)->{
        if(i==1){new AlertDialog.Builder(this).setTitle("Добавить подключение").setItems(new String[]{"Показать QR подключения","Сканировать ответный QR","Вставить данные вручную"},(x,n)->{if(n==0)invite();else if(n==1)scanRecipient();else importRecipient();}).show();return;}
        if(i==2){installClient();return;}if(i==6){new AlertDialog.Builder(this).setTitle("SMS Bridge · сервер 0.5.1").setMessage("Сборка 16.10.2026\nПроект Дмитрия · livesda3-rgb\nПриём SMS и отправка Web Push. MMS и отправка SMS не поддерживаются. До 5 SIM-профилей; сейчас один получатель для каждой SIM. Биометрия и пароль сервера пока не реализованы.\nПосле перезагрузки разблокируйте телефон. Ограничения батареи могут задержать отправку.").setPositiveButton("Понятно",null).show();return;}
        page=i==3?"sims":i==4?"diagnostics":i==5?"settings":"home";toolsPanel.setVisibility(i==5?android.view.View.VISIBLE:android.view.View.GONE);diagnosticsPanel.setVisibility(i==4?android.view.View.VISIBLE:android.view.View.GONE);routing.setVisibility(i==0||i==3?android.view.View.VISIBLE:android.view.View.GONE);renderRoutes();render();
    }).show();}
    private void connection(String[] recipient){new AlertDialog.Builder(this).setTitle(recipient[1]).setMessage("Статус: "+recipient[2]+"\nПодключение — это получатель. Назначение SIM настраивается отдельно.\nТестовый push проверяет интернет-доставку. Для полной проверки нужно новое SMS на SIM.").setPositiveButton("Тестовый push",(d,w)->{try(BridgeStore db=new BridgeStore(this)){db.test(recipient[0]);render();}catch(Exception e){fail(e);}}).setNeutralButton("Настроить SIM",(d,w)->{page="sims";renderRoutes();}).setNegativeButton("Ещё",(d,w)->new AlertDialog.Builder(this).setTitle(recipient[1]).setItems(new String[]{"Диагностика","Отозвать доступ"},(x,n)->{if(n==0){diagnosticsPanel.setVisibility(android.view.View.VISIBLE);render();}else new AlertDialog.Builder(this).setTitle("Отозвать доступ?").setMessage("Правила для этого получателя выключатся, его очередь будет удалена. Уже отправленные push отозвать нельзя.").setPositiveButton("Отозвать",(z,j)->{try(BridgeStore db=new BridgeStore(this)){db.revoke(recipient[0]);renderRoutes();}}).setNegativeButton("Отмена",null).show();}).show()).show();}
    private void installClient(){try{
        com.google.zxing.common.BitMatrix matrix=new com.google.zxing.qrcode.QRCodeWriter().encode(CLIENT_URL,com.google.zxing.BarcodeFormat.QR_CODE,640,640);
        android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(640,640,android.graphics.Bitmap.Config.RGB_565);for(int y=0;y<640;y++)for(int x=0;x<640;x++)bitmap.setPixel(x,y,matrix.get(x,y)?android.graphics.Color.BLACK:android.graphics.Color.WHITE);
        ImageView image=new ImageView(this);image.setImageBitmap(bitmap);image.setAdjustViewBounds(true);
        new AlertDialog.Builder(this).setTitle("Установить клиент").setMessage("Этот QR открывает сайт, но не даёт доступ к SMS.\niPhone: Safari → Поделиться → На экран «Домой». Android: меню браузера → Установить приложение. Затем выполните отдельную привязку.").setView(image).setPositiveButton("Скопировать ссылку",(d,w)->((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("SMS Bridge",CLIENT_URL))).setNeutralButton("Поделиться",(d,w)->startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,CLIENT_URL),"Установить SMS Bridge"))).setNegativeButton("Закрыть",null).show();
    }catch(Exception e){fail(e);}}
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
        new AlertDialog.Builder(this).setTitle("Разрешить подключение?").setMessage("Получатель: "+r.getString("name")+"\nPush-сервис: "+WebPush.endpoint(r.getJSONObject("subscription").getString("endpoint")).getHost()+"\n\nПосле подтверждения выберите «Настроить SIM» и назначьте этого получателя.").setPositiveButton("Разрешить",(d,w)->{try(BridgeStore db=new BridgeStore(this)){db.approve(raw);page="sims";renderRoutes();Toast.makeText(this,"Получатель добавлен. Настройте SIM и отправьте тестовый push.",Toast.LENGTH_LONG).show();}catch(Exception e){fail(e);}}).setNegativeButton("Отмена",null).show();
    }catch(Exception e){fail(e);}}
    private void importRecipient(){EditText v=input("Вставьте JSON получателя","");v.setMinLines(4);v.setMaxLines(10);
        new AlertDialog.Builder(this).setTitle("Добавить получателя вручную").setView(v).setPositiveButton("Проверить",(d,w)->confirmRecipient(v.getText().toString())).setNegativeButton("Отмена",null).show();
    }
    private void renderRoutes(){
        routing.removeAllViews();try(BridgeStore b=new BridgeStore(this)){
            for(String[] r:b.recipients()){
                LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(dp(14),dp(10),dp(14),dp(14));
                android.graphics.drawable.GradientDrawable background=new android.graphics.drawable.GradientDrawable();background.setColor(isDark()?0xff243b30:0xffedf3e5);background.setCornerRadius(dp(16));card.setBackground(background);
                LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(0,dp(8),0,dp(8));routing.addView(card,lp);
                card.addView(text(r[1],21));StringBuilder assigned=new StringBuilder();for(String[] profile:b.routes()){String[] rule=b.route(profile[0]);if(rule!=null&&r[0].equals(rule[3]))assigned.append(profile[1]).append(" · ");}
                card.addView(text(r[2]+"\n"+(assigned.length()==0?"SIM ещё не назначена — SMS не пересылаются":assigned.toString()),14));
                button(card,"Открыть подключение",()->connection(r));
            }
            if(b.recipients().isEmpty())routing.addView(text("Пока нет подключений. Откройте меню → Добавить подключение. После привязки назначьте получателя для SIM.",16));
            if(!page.equals("sims"))return;
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
