package com.spdyi.lab;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.util.DisplayMetrics;
import android.view.Display;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Read-only, permission-free snapshot. No identifiers, installed-app lists or game access. */
@CapacitorPlugin(name = "SpdyiDiagnostics")
public class DiagnosticsPlugin extends Plugin {
    @PluginMethod
    public void snapshot(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Context context = getContext();
                JSObject data = new JSObject();
                data.put("source", "Android system API");
                data.put("manufacturer", Build.MANUFACTURER);
                data.put("model", Build.MODEL);
                data.put("androidVersion", Build.VERSION.RELEASE);
                data.put("sdk", Build.VERSION.SDK_INT);
                data.put("cpuAbis", new JSArray(java.util.Arrays.asList(Build.SUPPORTED_ABIS)));
                data.put("logicalCores", Runtime.getRuntime().availableProcessors());
                ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
                ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(memory);
                data.put("ramTotalBytes", memory.totalMem);
                data.put("ramAvailableBytes", memory.availMem);
                data.put("lowMemory", memory.lowMemory);
                StatFs storage = new StatFs(Environment.getDataDirectory().getPath());
                data.put("storageTotalBytes", storage.getTotalBytes());
                data.put("storageAvailableBytes", storage.getAvailableBytes());
                Display display = getActivity().getWindowManager().getDefaultDisplay();
                DisplayMetrics metrics = new DisplayMetrics();
                display.getRealMetrics(metrics);
                data.put("displayWidthPx", metrics.widthPixels);
                data.put("displayHeightPx", metrics.heightPixels);
                data.put("densityDpi", metrics.densityDpi);
                data.put("logicalDensity", metrics.density);
                data.put("refreshRateHz", display.getRefreshRate());
                JSArray modes = new JSArray();
                for (Display.Mode mode : display.getSupportedModes()) {
                    JSObject item = new JSObject();
                    item.put("width", mode.getPhysicalWidth());
                    item.put("height", mode.getPhysicalHeight());
                    item.put("hz", mode.getRefreshRate());
                    modes.put(item);
                }
                data.put("displayModes", modes);
                Intent battery = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (battery != null) {
                    int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                    int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                    if (level >= 0 && scale > 0) data.put("batteryPercent", Math.round(100f * level / scale));
                    // An absent temperature must never be reported as a measured zero.
                    if (battery.hasExtra(BatteryManager.EXTRA_TEMPERATURE)) {
                        int temp = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
                        if (temp != Integer.MIN_VALUE) data.put("batteryTemperatureC", temp / 10.0);
                    }
                }
                PackageManager pm = context.getPackageManager();
                data.put("multitouchFeature", pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN_MULTITOUCH));
                data.put("multitouchDistinct", pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN_MULTITOUCH_DISTINCT));
                data.put("multitouchJazzhand", pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN_MULTITOUCH_JAZZHAND));
                SensorManager sm = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
                JSArray sensors = new JSArray();
                for (Sensor sensor : sm.getSensorList(Sensor.TYPE_ALL)) {
                    JSObject item = new JSObject();
                    item.put("name", sensor.getName());
                    item.put("type", sensor.getType());
                    item.put("vendor", sensor.getVendor());
                    sensors.put(item);
                }
                data.put("sensors", sensors);
                call.resolve(data);
            } catch (Exception error) {
                call.reject("Android diagnostics unavailable on this device", error);
            }
        });
    }
}
