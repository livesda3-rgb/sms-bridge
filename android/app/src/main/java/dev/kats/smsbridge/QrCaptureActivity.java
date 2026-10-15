package dev.kats.smsbridge;

import android.content.Intent;
import com.journeyapps.barcodescanner.*;

/** Continuous decoding; camera permission/lifecycle remain managed by ZXing. */
public class QrCaptureActivity extends CaptureActivity {
    private DecoratedBarcodeView scanner;
    private final QrParts parts=new QrParts();
    private boolean finished;
    @Override protected DecoratedBarcodeView initializeContent(){
        scanner=super.initializeContent();
        return scanner;
    }
    @Override public void onCreate(android.os.Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        scanner.setStatusText("Держите весь QR в рамке. Части сменяются автоматически");
        // Replace CaptureManager's one-shot callback after it has initialized the view.
        scanner.decodeContinuous(new BarcodeCallback(){
            @Override public void barcodeResult(BarcodeResult result){
                if(finished)return;
                try{
                    String data=parts.accept(result.getText());
                    if(data==null){scanner.setStatusText("Прочитано "+parts.received()+" из "+parts.total()+". Держите камеру на QR");return;}
                    finished=true;scanner.pause();
                    setResult(RESULT_OK,new Intent().putExtra("SCAN_RESULT",data).putExtra("SCAN_RESULT_FORMAT","QR_CODE"));
                    finish();
                }catch(Exception e){scanner.setStatusText(e.getMessage()==null?"Не удалось прочитать QR":e.getMessage());}
            }
        });
    }
}
