package dev.kats.smsbridge;

import android.app.job.*;
import android.content.*;
import org.json.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class DeliveryJob extends JobService {
    static final int JOB=41, RECOVERY=42;
    static final AtomicBoolean RUNNING=new AtomicBoolean(false);
    private volatile AtomicBoolean stopped;
    static void schedule(Context c){JobScheduler s=c.getSystemService(JobScheduler.class);
        if(s.getPendingJob(RECOVERY)==null)s.schedule(new JobInfo.Builder(RECOVERY,new ComponentName(c,DeliveryJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setPeriodic(15*60*1000).build());
        if(s.getPendingJob(JOB)!=null)return;s.schedule(new JobInfo.Builder(JOB,new ComponentName(c,DeliveryJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).setMinimumLatency(1).build());}
    public boolean onStartJob(JobParameters p){if(!RUNNING.compareAndSet(false,true)){jobFinished(p,true);return false;}AtomicBoolean flag=new AtomicBoolean(false);stopped=flag;
        new Thread(()->{boolean pending=false;try(BridgeStore db=new BridgeStore(this)){
            long deadline=System.currentTimeMillis()+90000;
            while(!flag.get()&&System.currentTimeMillis()<deadline){String[] row=db.next();if(row==null)break;int code=0;
                try{JSONObject sub=new JSONObject(row[2]),keys=sub.getJSONObject("keys");code=WebPush.send(sub.getString("endpoint"),keys.getString("p256dh"),keys.getString("auth"),row[1],Identity.privateKey(),Identity.publicKey());}catch(Exception ignored){/* no message, endpoint or keys in logs */}
                if(flag.get())break;db.result(row[0],code,Integer.parseInt(row[3]));
            }pending=db.pending();
        }catch(Exception ignored){pending=true;}RUNNING.set(false);if(!flag.get())jobFinished(p,pending&&p.getJobId()!=RECOVERY);
        },"sms-web-push").start();return true;}
    public boolean onStopJob(JobParameters p){if(stopped!=null)stopped.set(true);return true;}
}
