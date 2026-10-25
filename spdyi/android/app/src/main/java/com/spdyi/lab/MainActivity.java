package com.spdyi.lab;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DiagnosticsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
