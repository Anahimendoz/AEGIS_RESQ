package org.aegisresq.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins locales deben registrarse antes de crear el puente.
        registerPlugin(AegisNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
