package com.sunnyai.jarvis;

import android.Manifest;
import android.app.ActivityManager;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.provider.AlarmClock;
import android.provider.CalendarContract;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Real Android actions with honest results.
 *
 * Every method reports what actually happened. If Android will not let the app
 * verify something (for example "did the other app really open?"), the reply
 * says so instead of pretending. Nothing here talks to the network.
 */
@CapacitorPlugin(name = "JarvisTools")
public class JarvisToolsPlugin extends Plugin {

    private static final int REQ_MICROPHONE = 4201;
    private static final int REQ_CALENDAR = 4202;

    /* ------------------------------------------------------------ permissions */

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject permissionState() {
        JSObject out = new JSObject();
        out.put("microphone", granted(Manifest.permission.RECORD_AUDIO));
        out.put("calendar", granted(Manifest.permission.READ_CALENDAR) && granted(Manifest.permission.WRITE_CALENDAR));
        android.app.NotificationManager nm =
                (android.app.NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        out.put("notifications", nm != null && nm.areNotificationsEnabled());
        boolean installs = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            installs = getContext().getPackageManager().canRequestPackageInstalls();
        }
        out.put("installs", installs);
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            android.app.AlarmManager am =
                    (android.app.AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            exact = am == null || am.canScheduleExactAlarms();
        }
        out.put("exactAlarms", exact);
        out.put("sdk", Build.VERSION.SDK_INT);
        return out;
    }

    @PluginMethod
    public void permissions(PluginCall call) {
        JSObject out = new JSObject();
        out.put("permissions", permissionState());
        call.resolve(out);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        String name = call.getString("name", "");
        if ("microphone".equals(name)) {
            if (granted(Manifest.permission.RECORD_AUDIO)) {
                resolveGranted(call, "microphone");
                return;
            }
            ActivityCompat.requestPermissions(getActivity(),
                    new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MICROPHONE);
            resolveGranted(call, "asked");
            return;
        }
        if ("calendar".equals(name)) {
            if (granted(Manifest.permission.WRITE_CALENDAR)) {
                resolveGranted(call, "calendar");
                return;
            }
            ActivityCompat.requestPermissions(getActivity(),
                    new String[]{Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR},
                    REQ_CALENDAR);
            resolveGranted(call, "asked");
            return;
        }
        if ("notifications".equals(name)) {
            if (Build.VERSION.SDK_INT >= 33) {
                ActivityCompat.requestPermissions(getActivity(),
                        new String[]{"android.permission.POST_NOTIFICATIONS"}, 4101);
            }
            resolveGranted(call, "asked");
            return;
        }
        call.reject("unknown permission: " + name);
    }

    private void resolveGranted(PluginCall call, String state) {
        JSObject out = new JSObject();
        out.put("state", state);
        out.put("permissions", permissionState());
        call.resolve(out);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("verified", false);
            out.put("evidence", "the Android settings screen was opened for this app");
            call.resolve(out);
        } catch (Exception error) {
            call.reject("settings unavailable: " + error.getMessage(), error);
        }
    }

    /* ---------------------------------------------------------------- device */

    @PluginMethod
    public void deviceStats(PluginCall call) {
        Context ctx = getContext();
        ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
        if (am != null) am.getMemoryInfo(memory);
        File data = ctx.getFilesDir();
        StatFs stat = new StatFs(data.getAbsolutePath());
        long freeBytes = stat.getAvailableBytes();
        long totalBytes = stat.getTotalBytes();

        JSObject out = new JSObject();
        out.put("device", Build.MANUFACTURER + " " + Build.MODEL);
        out.put("sdk", Build.VERSION.SDK_INT);
        out.put("android", Build.VERSION.RELEASE);
        out.put("cores", Runtime.getRuntime().availableProcessors());
        out.put("totalRamMb", memory.totalMem / (1024 * 1024));
        out.put("availRamMb", memory.availMem / (1024 * 1024));
        out.put("lowMemory", memory.lowMemory);
        out.put("thresholdMb", memory.threshold / (1024 * 1024));
        out.put("freeStorageMb", freeBytes / (1024 * 1024));
        out.put("totalStorageMb", totalBytes / (1024 * 1024));
        out.put("uptimeMs", android.os.SystemClock.elapsedRealtime());

        Intent battery = ctx.registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery != null) {
            int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            out.put("batteryPct", scale > 0 ? Math.round(level * 100f / scale) : -1);
            int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            out.put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING
                    || status == BatteryManager.BATTERY_STATUS_FULL);
        }
        out.put("ok", true);
        out.put("verified", true);
        out.put("evidence", "read from ActivityManager, StatFs and the battery broadcast");
        call.resolve(out);
    }

    /* ------------------------------------------------------------------ apps */

    private List<ResolveInfo> launchable(PackageManager pm) {
        Intent intent = new Intent(Intent.ACTION_MAIN, null);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        return pm.queryIntentActivities(intent, 0);
    }

    @PluginMethod
    public void listApps(PluginCall call) {
        String query = call.getString("query", "").toLowerCase(Locale.ROOT);
        PackageManager pm = getContext().getPackageManager();
        JSArray rows = new JSArray();
        List<ResolveInfo> apps = launchable(pm);
        Collections.sort(apps, (a, b) -> String.CASE_INSENSITIVE_ORDER.compare(
                String.valueOf(a.loadLabel(pm)), String.valueOf(b.loadLabel(pm))));
        for (ResolveInfo info : apps) {
            String label = String.valueOf(info.loadLabel(pm));
            String pkg = info.activityInfo.packageName;
            if (!query.isEmpty() && !label.toLowerCase(Locale.ROOT).contains(query)
                    && !pkg.toLowerCase(Locale.ROOT).contains(query)) continue;
            JSObject row = new JSObject();
            row.put("label", label);
            row.put("package", pkg);
            rows.put(row);
            if (rows.length() >= 80) break;
        }
        JSObject out = new JSObject();
        out.put("ok", true);
        out.put("verified", true);
        out.put("evidence", rows.length() + " launchable apps were read from PackageManager");
        out.put("apps", rows);
        call.resolve(out);
    }

    @PluginMethod
    public void launchApp(PluginCall call) {
        String pkg = call.getString("package", "");
        String label = call.getString("label", "");
        PackageManager pm = getContext().getPackageManager();
        if (pkg.isEmpty() && !label.isEmpty()) {
            for (ResolveInfo info : launchable(pm)) {
                if (String.valueOf(info.loadLabel(pm)).equalsIgnoreCase(label)) {
                    pkg = info.activityInfo.packageName;
                    break;
                }
            }
        }
        JSObject out = new JSObject();
        if (pkg.isEmpty()) {
            out.put("ok", false);
            out.put("supported", false);
            out.put("verified", false);
            out.put("evidence", "no installed app matches that name");
            call.resolve(out);
            return;
        }
        Intent intent = pm.getLaunchIntentForPackage(pkg);
        if (intent == null) {
            out.put("ok", false);
            out.put("supported", false);
            out.put("verified", false);
            out.put("evidence", pkg + " has no launchable screen on this phone");
            call.resolve(out);
            return;
        }
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            out.put("ok", true);
            out.put("supported", true);
            // Android does not let a normal app confirm that another app reached
            // the foreground, so this is reported as unverified, not as success.
            out.put("verified", false);
            out.put("evidence", "Android accepted the launch request for " + pkg
                    + "; the system does not expose whether the app reached the screen");
            out.put("package", pkg);
            call.resolve(out);
        } catch (Exception error) {
            out.put("ok", false);
            out.put("verified", false);
            out.put("error", "the launch was refused: " + error.getMessage());
            call.resolve(out);
        }
    }

    /* ----------------------------------------------------------------- files */

    private File notesDir() {
        File dir = new File(getContext().getFilesDir(), "notes");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private String safeName(String name) {
        String clean = String.valueOf(name == null ? "" : name).replaceAll("[^A-Za-z0-9._ -]", "_").trim();
        if (clean.isEmpty()) clean = "note-" + System.currentTimeMillis();
        if (clean.length() > 60) clean = clean.substring(0, 60);
        if (!clean.toLowerCase(Locale.ROOT).endsWith(".md")) clean += ".md";
        return clean;
    }

    private String digest(byte[] bytes) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] out = md.digest(bytes);
            StringBuilder sb = new StringBuilder();
            for (byte b : out) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception error) {
            return "";
        }
    }

    @PluginMethod
    public void writeNote(PluginCall call) {
        String name = safeName(call.getString("name", ""));
        String text = call.getString("text", "");
        File file = new File(notesDir(), name);
        try {
            FileOutputStream stream = new FileOutputStream(file);
            stream.write(text.getBytes("UTF-8"));
            stream.close();

            // Read it back: the result is only "ok" when the file on disk matches.
            byte[] back = new byte[(int) file.length()];
            FileInputStream in = new FileInputStream(file);
            int read = in.read(back);
            in.close();
            String expected = digest(text.getBytes("UTF-8"));
            String actual = digest(back);
            JSObject out = new JSObject();
            out.put("ok", read == back.length && expected.equals(actual));
            out.put("verified", expected.equals(actual));
            out.put("name", name);
            out.put("path", file.getAbsolutePath());
            out.put("bytes", file.length());
            out.put("sha256", actual);
            out.put("evidence", expected.equals(actual)
                    ? "the file was written and read back with the same SHA-256"
                    : "the file was written but the read-back checksum differs");
            call.resolve(out);
        } catch (Exception error) {
            call.reject("write failed: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void readNote(PluginCall call) {
        String name = safeName(call.getString("name", ""));
        File file = new File(notesDir(), name);
        if (!file.exists()) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("verified", true);
            out.put("evidence", "no note named " + name);
            call.resolve(out);
            return;
        }
        try {
            byte[] bytes = new byte[(int) file.length()];
            FileInputStream in = new FileInputStream(file);
            int read = in.read(bytes);
            in.close();
            JSObject out = new JSObject();
            out.put("ok", read == bytes.length);
            out.put("verified", true);
            out.put("name", name);
            out.put("text", new String(bytes, "UTF-8"));
            out.put("bytes", file.length());
            call.resolve(out);
        } catch (Exception error) {
            call.reject("read failed: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void listNotes(PluginCall call) {
        File[] files = notesDir().listFiles();
        JSArray rows = new JSArray();
        List<File> sorted = new ArrayList<>();
        if (files != null) Collections.addAll(sorted, files);
        Collections.sort(sorted, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        for (File file : sorted) {
            JSObject row = new JSObject();
            row.put("name", file.getName());
            row.put("bytes", file.length());
            row.put("updated", file.lastModified());
            rows.put(row);
        }
        JSObject out = new JSObject();
        out.put("ok", true);
        out.put("verified", true);
        out.put("evidence", rows.length() + " notes listed from app storage");
        out.put("notes", rows);
        call.resolve(out);
    }

    /* -------------------------------------------------------------- calendar */

    @PluginMethod
    public void addCalendarEvent(PluginCall call) {
        if (!granted(Manifest.permission.WRITE_CALENDAR)) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("supported", true);
            out.put("verified", false);
            out.put("permission", "calendar");
            out.put("evidence", "calendar permission has not been granted");
            call.resolve(out);
            return;
        }
        String title = call.getString("title", "JARVIS event");
        long start = call.getLong("start", System.currentTimeMillis() + 3600000L);
        long end = start + call.getLong("minutes", 30L) * 60000L;
        try {
            ContentValues values = new ContentValues();
            values.put(CalendarContract.Events.DTSTART, start);
            values.put(CalendarContract.Events.DTEND, end);
            values.put(CalendarContract.Events.TITLE, title);
            values.put(CalendarContract.Events.DESCRIPTION, "Created by JARVIS");
            values.put(CalendarContract.Events.CALENDAR_ID, 1);
            values.put(CalendarContract.Events.EVENT_TIMEZONE, java.util.TimeZone.getDefault().getID());
            ContentResolver resolver = getContext().getContentResolver();
            Uri uri = resolver.insert(CalendarContract.Events.CONTENT_URI, values);
            if (uri == null) {
                JSObject out = new JSObject();
                out.put("ok", false);
                out.put("verified", false);
                out.put("evidence", "the calendar provider refused the insert");
                call.resolve(out);
                return;
            }
            long id = ContentUris.parseId(uri);
            // Verify by reading the row back.
            android.database.Cursor cursor = resolver.query(uri,
                    new String[]{CalendarContract.Events.TITLE, CalendarContract.Events.DTSTART}, null, null, null);
            boolean found = false;
            String foundTitle = "";
            if (cursor != null) {
                if (cursor.moveToFirst()) {
                    found = true;
                    foundTitle = cursor.getString(0);
                }
                cursor.close();
            }
            JSObject out = new JSObject();
            out.put("ok", found);
            out.put("verified", found);
            out.put("id", id);
            out.put("title", foundTitle);
            out.put("evidence", found ? "the event was written and read back from the calendar"
                    : "the insert returned an id but the event could not be read back");
            call.resolve(out);
        } catch (Exception error) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("verified", false);
            out.put("evidence", "the calendar rejected the event: " + error.getMessage());
            call.resolve(out);
        }
    }

    /* ------------------------------------------------------------- reminders */

    @PluginMethod
    public void setReminder(PluginCall call) {
        String text = call.getString("text", "Reminder");
        int minutes = Math.max(1, call.getInt("minutes", 10));
        try {
            int hour = (int) ((System.currentTimeMillis() / 3600000L + 0) % 24);
            java.util.Calendar cal = java.util.Calendar.getInstance();
            cal.add(java.util.Calendar.MINUTE, minutes);
            Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM);
            intent.putExtra(AlarmClock.EXTRA_MESSAGE, text);
            intent.putExtra(AlarmClock.EXTRA_HOUR, cal.get(java.util.Calendar.HOUR_OF_DAY));
            intent.putExtra(AlarmClock.EXTRA_MINUTES, cal.get(java.util.Calendar.MINUTE));
            intent.putExtra(AlarmClock.EXTRA_SKIP_UI, false);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("verified", false);
            out.put("evidence", "the alarm screen was opened at " + cal.get(java.util.Calendar.HOUR_OF_DAY)
                    + ":" + String.format("%02d", cal.get(java.util.Calendar.MINUTE))
                    + "; the clock app keeps the alarm and JARVIS cannot read it back");
            call.resolve(out);
        } catch (Exception error) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("supported", false);
            out.put("verified", false);
            out.put("evidence", "this phone has no clock app that accepts an alarm: " + error.getMessage());
            call.resolve(out);
        }
    }

    /* ----------------------------------------------------------------- media */

    @PluginMethod
    public void mediaControl(PluginCall call) {
        String action = call.getString("action", "playpause");
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int key;
        switch (action) {
            case "next": key = android.view.KeyEvent.KEYCODE_MEDIA_NEXT; break;
            case "previous": key = android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS; break;
            case "stop": key = android.view.KeyEvent.KEYCODE_MEDIA_STOP; break;
            default: key = android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE; break;
        }
        try {
            long now = android.os.SystemClock.uptimeMillis();
            audio.dispatchMediaKeyEvent(new android.view.KeyEvent(now, now,
                    android.view.KeyEvent.ACTION_DOWN, key, 0));
            audio.dispatchMediaKeyEvent(new android.view.KeyEvent(now, now,
                    android.view.KeyEvent.ACTION_UP, key, 0));
            boolean playing = audio.isMusicActive();
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("verified", true);
            out.put("playing", playing);
            out.put("evidence", "media key sent; AudioManager reports music " + (playing ? "active" : "inactive"));
            call.resolve(out);
        } catch (Exception error) {
            call.reject("media control failed: " + error.getMessage(), error);
        }
    }

    /* ----------------------------------------------------------------- media */

    @PluginMethod
    public void playMusic(PluginCall call) {
        String query = call.getString("query", "");
        if (query == null || query.trim().isEmpty()) {
            call.reject("query required");
            return;
        }
        JSObject out = new JSObject();
        Intent intent = new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://www.youtube.com/results?search_query=" + Uri.encode(query)));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            out.put("ok", true);
            out.put("verified", false);
            out.put("query", query);
            out.put("evidence", "YouTube search opened; Android cannot confirm that playback started");
        } catch (Exception error) {
            out.put("ok", false);
            out.put("verified", true);
            out.put("evidence", "no app can open YouTube: " + error.getMessage());
        }
        call.resolve(out);
    }

    @PluginMethod
    public void setAlarm(PluginCall call) {
        int hour = Math.max(0, Math.min(23, call.getInt("hour", 7)));
        int minute = Math.max(0, Math.min(59, call.getInt("minute", 0)));
        String label = call.getString("label", "JARVIS alarm");
        JSObject out = new JSObject();
        Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM);
        intent.putExtra(AlarmClock.EXTRA_HOUR, hour);
        intent.putExtra(AlarmClock.EXTRA_MINUTES, minute);
        intent.putExtra(AlarmClock.EXTRA_MESSAGE, label);
        intent.putExtra(AlarmClock.EXTRA_SKIP_UI, false);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            out.put("ok", true);
            out.put("verified", false);
            out.put("hour", hour);
            out.put("minute", minute);
            out.put("label", label);
            out.put("evidence", "the clock app opened with the alarm filled in; saving it is that app's job");
        } catch (Exception error) {
            out.put("ok", false);
            out.put("verified", true);
            out.put("evidence", "no alarm app accepted the intent: " + error.getMessage());
        }
        call.resolve(out);
    }

    @PluginMethod
    public void messageDraft(PluginCall call) {
        String number = call.getString("number", "");
        String text = call.getString("text", "");
        String digits = number == null ? "" : number.replaceAll("[^0-9]", "");
        String body = text == null ? "" : text;
        JSObject out = new JSObject();
        String url = digits.isEmpty()
                ? "https://wa.me/?text=" + Uri.encode(body)
                : "https://wa.me/" + digits + "?text=" + Uri.encode(body);
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            out.put("ok", true);
            out.put("verified", false);
            out.put("number", digits);
            out.put("text", body);
            out.put("evidence", "WhatsApp opened with the message written; you still tap Send");
        } catch (Exception error) {
            out.put("ok", false);
            out.put("verified", true);
            out.put("evidence", "no app can open WhatsApp: " + error.getMessage());
        }
        call.resolve(out);
    }

    /* ----------------------------------------------------------------- voice */

    @PluginMethod
    public void speechSupport(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        boolean onDevice = false;
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                onDevice = SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
            } catch (Throwable ignored) {
                onDevice = false;
            }
        }
        out.put("onDevice", onDevice);
        out.put("microphone", granted(Manifest.permission.RECORD_AUDIO));
        out.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(out);
    }

    @PluginMethod
    public void listenOffline(PluginCall call) {
        JSObject out = new JSObject();
        if (!granted(Manifest.permission.RECORD_AUDIO)) {
            out.put("text", "");
            out.put("permission", "microphone");
            out.put("evidence", "the microphone permission is not granted");
            call.resolve(out);
            return;
        }
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "en-IN"));
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Speak now"));
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            startActivityForResult(call, intent, "offlineSpeechResult");
        } catch (Exception error) {
            out.put("text", "");
            out.put("evidence", "this phone has no speech recogniser that works offline: " + error.getMessage());
            call.resolve(out);
        }
    }

    @com.getcapacitor.annotation.ActivityCallback
    private void offlineSpeechResult(PluginCall call, androidx.activity.result.ActivityResult result) {
        JSObject out = new JSObject();
        if (result.getResultCode() == android.app.Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> matches = result.getData()
                    .getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            out.put("text", matches != null && !matches.isEmpty() ? matches.get(0) : "");
            out.put("cancelled", false);
            out.put("evidence", "text came from the on-device recogniser");
        } else {
            out.put("text", "");
            out.put("cancelled", true);
        }
        call.resolve(out);
    }

    @PluginMethod
    public void ttsSupport(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", true);
        TextToSpeech probe = new TextToSpeech(getContext(), status -> { });
        try {
            Set<Voice> voices = probe == null ? null : probe.getVoices();
            int offline = 0;
            if (voices != null) {
                for (Voice voice : voices) {
                    if (!voice.isNetworkConnectionRequired()) offline += 1;
                }
            }
            out.put("offlineVoices", offline);
            out.put("engine", probe == null ? "" : String.valueOf(probe.getDefaultEngine()));
        } catch (Exception error) {
            out.put("offlineVoices", 0);
        }
        try {
            if (probe != null) probe.shutdown();
        } catch (Exception ignored) {
        }
        call.resolve(out);
    }
}
