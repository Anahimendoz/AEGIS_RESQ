package org.aegisresq.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;

/**
 * Funciones nativas que los plugins oficiales no cubren:
 * anunciarse como baliza BLE, permisos de micrófono/anuncio y abrir los ajustes de la app.
 */
@CapacitorPlugin(
    name = "AegisNative",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = AegisNativePlugin.MICROPHONE),
        @Permission(strings = { "android.permission.BLUETOOTH_ADVERTISE" }, alias = AegisNativePlugin.ADVERTISE)
    }
)
public class AegisNativePlugin extends Plugin {

    static final String MICROPHONE = "microphone";
    static final String ADVERTISE = "advertise";
    /** Identificador de compañía 0xFFFF: reservado por Bluetooth SIG para pruebas, no para productos. */
    private static final int TEST_COMPANY_ID = 0xFFFF;
    private static final int MAX_PAYLOAD_BYTES = 20;

    private AdvertiseCallback activeCallback;

    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        call.resolve(permissionStatus());
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        List<String> aliases = new ArrayList<>();
        JSArray requested = call.getArray("permissions", new JSArray());
        try {
            for (Object item : requested.toList()) {
                String alias = String.valueOf(item);
                if (MICROPHONE.equals(alias) || (ADVERTISE.equals(alias) && advertiseNeedsRuntimePermission())) {
                    aliases.add(alias);
                }
            }
        } catch (JSONException e) {
            call.reject("Lista de permisos inválida.");
            return;
        }
        if (aliases.isEmpty()) {
            call.resolve(permissionStatus());
            return;
        }
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "onPermissionResult");
    }

    @PermissionCallback
    private void onPermissionResult(PluginCall call) {
        call.resolve(permissionStatus());
    }

    @PluginMethod
    public void getAdvertisingSupport(PluginCall call) {
        JSObject result = new JSObject();
        BluetoothAdapter adapter = adapter();
        if (adapter == null) {
            result.put("supported", false);
            result.put("reason", "no-adapter");
        } else if (!adapter.isEnabled()) {
            result.put("supported", false);
            result.put("reason", "bluetooth-disabled");
        } else if (!adapter.isMultipleAdvertisementSupported() || adapter.getBluetoothLeAdvertiser() == null) {
            result.put("supported", false);
            result.put("reason", "no-advertiser");
        } else {
            result.put("supported", true);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void startAdvertising(PluginCall call) {
        if (advertiseNeedsRuntimePermission() && getPermissionState(ADVERTISE) != PermissionState.GRANTED) {
            call.reject("Permission denied: BLUETOOTH_ADVERTISE");
            return;
        }
        BluetoothAdapter adapter = adapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("bluetooth-disabled");
            return;
        }
        BluetoothLeAdvertiser advertiser = adapter.getBluetoothLeAdvertiser();
        if (advertiser == null) {
            call.reject("advertising-unsupported");
            return;
        }
        byte[] payload;
        try {
            JSArray values = call.getArray("payload", new JSArray());
            if (values.length() == 0 || values.length() > MAX_PAYLOAD_BYTES) {
                call.reject("Carga de anuncio vacía o demasiado larga.");
                return;
            }
            payload = new byte[values.length()];
            for (int i = 0; i < values.length(); i++) {
                payload[i] = (byte) (values.getInt(i) & 0xFF);
            }
        } catch (JSONException e) {
            call.reject("Carga de anuncio inválida.");
            return;
        }

        boolean lowPower = Boolean.TRUE.equals(call.getBoolean("lowPower", true));
        AdvertiseSettings settings = new AdvertiseSettings.Builder()
            .setAdvertiseMode(lowPower ? AdvertiseSettings.ADVERTISE_MODE_LOW_POWER : AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(false)
            .build();
        AdvertiseData data = new AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addManufacturerData(TEST_COMPANY_ID, payload)
            .build();

        try {
            stopActiveAdvertising(advertiser);
            activeCallback = new AdvertiseCallback() {
                @Override
                public void onStartSuccess(AdvertiseSettings settingsInEffect) {
                    call.resolve();
                }

                @Override
                public void onStartFailure(int errorCode) {
                    activeCallback = null;
                    call.reject("advertise-failed-" + errorCode);
                }
            };
            advertiser.startAdvertising(settings, data, activeCallback);
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopAdvertising(PluginCall call) {
        BluetoothAdapter adapter = adapter();
        if (adapter != null && adapter.getBluetoothLeAdvertiser() != null) {
            try {
                stopActiveAdvertising(adapter.getBluetoothLeAdvertiser());
            } catch (SecurityException e) {
                call.reject("Permission denied: " + e.getMessage());
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        BluetoothAdapter adapter = adapter();
        if (adapter != null && adapter.getBluetoothLeAdvertiser() != null) {
            try {
                stopActiveAdvertising(adapter.getBluetoothLeAdvertiser());
            } catch (SecurityException ignored) {
                // Sin permiso no puede haber un anuncio activo.
            }
        }
    }

    private void stopActiveAdvertising(BluetoothLeAdvertiser advertiser) {
        if (activeCallback != null) {
            advertiser.stopAdvertising(activeCallback);
            activeCallback = null;
        }
    }

    private JSObject permissionStatus() {
        JSObject result = new JSObject();
        result.put(MICROPHONE, getPermissionState(MICROPHONE).toString());
        result.put(ADVERTISE, advertiseNeedsRuntimePermission() ? getPermissionState(ADVERTISE).toString() : "granted");
        return result;
    }

    private boolean advertiseNeedsRuntimePermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager != null ? manager.getAdapter() : null;
    }
}
