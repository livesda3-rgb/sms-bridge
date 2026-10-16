package dev.kats.smsbridge;

import android.app.job.*;
import android.content.*;
import org.json.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class DeliveryJob extends JobService {
    static final int JOB=41, RECOVERY=42;
    static final AtomicBoolean RUNNING=new AtomicBoolean(false);
    private volatile AtomicBoolean stopped;
    static void schedule(Context c){JobScheduler scheduler=c.getSystemService(JobScheduler.class);
        ComponentName service=new ComponentName(c,DeliveryJob.class);
        if(scheduler.getPendingJob(RECOVERY)==null)scheduler.schedule(new JobInfo.Builder(RECOVERY,service).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setPeriodic(15*60*1000).build());
        JobInfo pending=scheduler.getPendingJob(JOB);
        // Upgrade a queued regular job from older versions, but never replace a running drain.
        if(pending!=null&&(RUNNING.get()||android.os.Build.VERSION.SDK_INT<31||pending.isExpedited()))return;
        if(android.os.Build.VERSION.SDK_INT>=31){
            JobInfo urgent=new JobInfo.Builder(JOB,service).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setExpedited(true).build();
            if(scheduler.schedule(urgent)==JobScheduler.RESULT_SUCCESS)return;
        }
        // Expedited quota may be exhausted. Preserve delivery with the normal persisted job.
        if(pending==null)scheduler.schedule(new JobInfo.Builder(JOB,service).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build());
    }
    public boolean onStartJob(JobParameters p){if(!RUNNING.compareAndSet(false,true)){jobFinished(p,true);return false;}AtomicBoolean flag=new AtomicBoolean(false);stopped=flag;
        new Thread(()->{boolean pending=false;try(BridgeStore db=new BridgeStore(this)){
            long deadline=System.currentTimeMillis()+90000;
            while(!flag.get()&&System.currentTimeMillis()<deadline){String[] row=db.next();if(row==null)break;int code=0;
                long started=android.os.SystemClock.elapsedRealtime();
                long queueSeconds=Math.max(0,(System.currentTimeMillis()-Long.parseLong(row[4]))/1000);
                String mode=android.os.Build.VERSION.SDK_INT>=31&&p.isExpeditedJob()?"ускоренная":"обычная";
                db.timing("Начало отправки: "+new java.util.Date()+" · очередь "+queueSeconds+" с · задача "+mode);
                try{JSONObject sub=new JSONObject(row[2]),keys=sub.getJSONObject("keys");code=WebPush.send(sub.getString("endpoint"),keys.getString("p256dh"),keys.getString("auth"),row[1],Identity.privateKey(),Identity.publicKey());}catch(Exception ignored){/* no message, endpoint or keys in logs */}
                if(flag.get())break;db.result(row[0],code,Integer.parseInt(row[3]));
                db.timing("Попытка: "+new java.util.Date()+" · очередь "+queueSeconds+" с · HTTP "+code+" за "+(android.os.SystemClock.elapsedRealtime()-started)+" мс · задача "+mode);
            }pending=db.pending();
        }catch(Exception ignored){pending=true;}RUNNING.set(false);if(!flag.get())jobFinished(p,pending&&p.getJobId()!=RECOVERY);
        },"sms-web-push").start();return true;}
    public boolean onStopJob(JobParameters p){if(stopped!=null)stopped.set(true);return true;}
}
