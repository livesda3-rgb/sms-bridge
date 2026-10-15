package dev.kats.smsbridge;

/** Camera frames are decoded locally; no image files are saved. */
public class QrCaptureActivity extends com.journeyapps.barcodescanner.CaptureActivity {
    @Override public void onCreate(android.os.Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
    }
}
