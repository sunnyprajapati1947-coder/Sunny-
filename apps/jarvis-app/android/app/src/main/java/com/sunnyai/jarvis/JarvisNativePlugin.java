package com.sunnyai.jarvis;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Locale;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * The small native layer the web app cannot do on its own: gallery writes,
 * notifications, text to speech, speech recognition, encrypted storage,
 * update downloads and a foreground keep-alive while tasks are pending.
 *
 * Everything is local. No analytics, no third-party SDK, no background upload.
 */
@CapacitorPlugin(name = "JarvisNative")
public class JarvisNativePlugin extends Plugin {
    private static final String CHANNEL_ID = "jarvis";
    private static final String VAULT = "jarvis_vault";
    private static final String KEY_ALIAS = "jarvis_vault_key";
    private TextToSpeech tts;
    private BroadcastReceiver downloadReceiver;

    // ------------------------------------------------------------------ info

    @PluginMethod
    public void info(PluginCall call) {
        JSObject out = new JSObject();
        out.put("name", "JARVIS");
        out.put("package", getContext().getPackageName());
        out.put("version", BuildConfig.VERSION_NAME);
        out.put("versionCode", BuildConfig.VERSION_CODE);
        out.put("sdk", Build.VERSION.SDK_INT);
        out.put("device", Build.MANUFACTURER + " " + Build.MODEL);
        out.put("native", true);
        call.resolve(out);
    }

    @PluginMethod
    public void selfCheck(PluginCall call) {
        JSObject out = new JSObject();
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        out.put("notifications", nm != null && nm.areNotificationsEnabled());
        boolean installs = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            installs = getContext().getPackageManager().canRequestPackageInstalls();
        }
        out.put("installs", installs);
        File dir = getContext().getFilesDir();
        out.put("freeMb", dir.getFreeSpace() / (1024 * 1024));
        out.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(out);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(),
                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4101);
        }
        call.resolve();
    }

    // ---------------------------------------------------------------- gallery

    @PluginMethod
    public void saveToGallery(PluginCall call) {
        String data = call.getString("base64", "");
        String name = call.getString("filename", "jarvis-" + System.currentTimeMillis());
        String mime = call.getString("mime", "image/png");
        if (data.isEmpty()) {
            call.reject("empty file");
            return;
        }
        try {
            int comma = data.indexOf(',');
            if (data.startsWith("data:") && comma > 0) data = data.substring(comma + 1);
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            boolean video = mime.startsWith("video/");
            String saved = writeMedia(bytes, name, mime, video);
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("uri", saved);
            call.resolve(out);
        } catch (Exception error) {
            call.reject("save failed: " + error.getMessage(), error);
        }
    }

    private String writeMedia(byte[] bytes, String name, String mime, boolean video) throws Exception {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH,
                    video ? Environment.DIRECTORY_MOVIES + "/JARVIS" : Environment.DIRECTORY_PICTURES + "/JARVIS");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri collection = video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                    : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            Uri uri = ctx.getContentResolver().insert(collection, values);
            if (uri == null) throw new Exception("media store refused the file");
            OutputStream stream = ctx.getContentResolver().openOutputStream(uri);
            if (stream == null) throw new Exception("cannot open the media store file");
            stream.write(bytes);
            stream.close();
            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            ctx.getContentResolver().update(uri, values, null, null);
            return uri.toString();
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(
                video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES), "JARVIS");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("cannot create the gallery folder");
        File file = new File(dir, name);
        FileOutputStream stream = new FileOutputStream(file);
        stream.write(bytes);
        stream.close();
        android.media.MediaScannerConnection.scanFile(ctx, new String[]{file.getAbsolutePath()},
                new String[]{mime}, null);
        return Uri.fromFile(file).toString();
    }

    // ------------------------------------------------------------------ share

    @PluginMethod
    public void share(PluginCall call) {
        String text = call.getString("text", "");
        String url = call.getString("url", "");
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType("text/plain");
        intent.putExtra(Intent.EXTRA_TEXT, text + (url.isEmpty() ? "" : "\n" + url));
        Intent chooser = Intent.createChooser(intent, "Share via");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(chooser);
        call.resolve();
    }

    @PluginMethod
    public void copyText(PluginCall call) {
        android.content.ClipboardManager clipboard = (android.content.ClipboardManager)
                getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(ClipData.newPlainText("JARVIS", call.getString("text", "")));
        call.resolve();
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (url.isEmpty()) {
            call.reject("url required");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    // ----------------------------------------------------------- notifications

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "JARVIS",
                NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Task updates and reminders from JARVIS");
        nm.createNotificationChannel(channel);
    }

    @PluginMethod
    public void notify(PluginCall call) {
        String title = call.getString("title", "JARVIS");
        String body = call.getString("body", "");
        boolean ongoing = Boolean.TRUE.equals(call.getBoolean("ongoing", false));
        ensureChannel();
        if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(),
                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4101);
            call.resolve();
            return;
        }
        Intent open = new Intent(getContext(), MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(getContext(), 1, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(getContext(), CHANNEL_ID)
                : new Notification.Builder(getContext());
        builder.setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentIntent(pending)
                .setOngoing(ongoing)
                .setAutoCancel(!ongoing);
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify((int) (System.currentTimeMillis() % 100000), builder.build());
        call.resolve();
    }

    // ------------------------------------------------------------------- voice

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        final String lang = call.getString("lang", "hi-IN");
        if (text.isEmpty()) {
            call.resolve();
            return;
        }
        if (tts == null) {
            tts = new TextToSpeech(getContext(), status -> {
                if (status != TextToSpeech.SUCCESS) return;
                tts.setLanguage(guessLocale(lang));
                tts.speak(lang, TextToSpeech.QUEUE_FLUSH, null, "jarvis");
            });
        } else {
            tts.setLanguage(guessLocale(lang));
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "jarvis");
        }
        call.resolve();
    }

    private Locale guessLocale(String tag) {
        try {
            Locale locale = Locale.forLanguageTag(tag);
            if (tts != null && tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) return locale;
        } catch (Exception ignored) {
        }
        return Locale.getDefault();
    }

    @PluginMethod
    public void stopSpeak(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @PluginMethod
    public void listen(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "hi-IN"));
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Bol do…"));
        try {
            startActivityForResult(call, intent, "speechResult");
        } catch (Exception error) {
            call.reject("no speech recogniser on this phone", error);
        }
    }

    @ActivityCallback
    private void speechResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject out = new JSObject();
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> matches = result.getData().getStringArrayListExtra(
                    RecognizerIntent.EXTRA_RESULTS);
            out.put("text", matches != null && !matches.isEmpty() ? matches.get(0) : "");
            call.resolve(out);
        } else {
            out.put("text", "");
            out.put("cancelled", true);
            call.resolve(out);
        }
    }

    // ------------------------------------------------------------------ vault

    private SecretKey vaultKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
            generator.init(new android.security.keystore.KeyGenParameterSpec.Builder(KEY_ALIAS,
                    android.security.keystore.KeyProperties.PURPOSE_ENCRYPT |
                            android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
    }

    @PluginMethod
    public void secureSet(PluginCall call) {
        String key = call.getString("key", "");
        String value = call.getString("value", "");
        if (key.isEmpty()) {
            call.reject("key required");
            return;
        }
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(VAULT, Context.MODE_PRIVATE);
            if (value.isEmpty()) {
                prefs.edit().remove(key).apply();
                call.resolve();
                return;
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, vaultKey());
            byte[] encrypted = cipher.doFinal(value.getBytes("UTF-8"));
            byte[] iv = cipher.getIV();
            byte[] both = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, both, 0, iv.length);
            System.arraycopy(encrypted, 0, both, iv.length, encrypted.length);
            prefs.edit().putString(key, Base64.encodeToString(both, Base64.NO_WRAP)).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("vault unavailable: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void secureGet(PluginCall call) {
        String key = call.getString("key", "");
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(VAULT, Context.MODE_PRIVATE);
            String stored = prefs.getString(key, null);
            JSObject out = new JSObject();
            if (stored == null) {
                out.put("value", "");
                call.resolve(out);
                return;
            }
            byte[] both = Base64.decode(stored, Base64.NO_WRAP);
            byte[] iv = new byte[12];
            System.arraycopy(both, 0, iv, 0, 12);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, vaultKey(), new GCMParameterSpec(128, iv));
            byte[] plain = cipher.doFinal(both, 12, both.length - 12);
            out.put("value", new String(plain, "UTF-8"));
            call.resolve(out);
        } catch (Exception error) {
            JSObject out = new JSObject();
            out.put("value", "");
            out.put("error", error.getMessage());
            call.resolve(out);
        }
    }

    // ----------------------------------------------------------------- update

    /** Fetches a GitHub "latest release" JSON and compares tags with this build. */
    @PluginMethod
    public void checkUpdate(PluginCall call) {
        final String url = call.getString("url", "");
        if (url.isEmpty()) {
            call.reject("url required");
            return;
        }
        final String current = BuildConfig.VERSION_NAME;
        new Thread(() -> {
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                int code = connection.getResponseCode();
                if (code != 200) {
                    call.reject("update check failed: HTTP " + code);
                    return;
                }
                StringBuilder body = new StringBuilder();
                try (InputStream stream = connection.getInputStream();
                     BufferedReader reader = new BufferedReader(new InputStreamReader(stream))) {
                    String line;
                    while ((line = reader.readLine()) != null) body.append(line);
                }
                JSONObject json = new JSONObject(body.toString());
                String tag = json.optString("tag_name", "");
                String notes = json.optString("body", "");
                String apkUrl = "";
                int bytes = 0;
                JSONArray assets = json.optJSONArray("assets");
                if (assets != null) {
                    for (int i = 0; i < assets.length(); i += 1) {
                        JSONObject asset = assets.getJSONObject(i);
                        String name = asset.optString("name", "");
                        if (name.endsWith(".apk")) {
                            apkUrl = asset.optString("browser_download_url", "");
                            bytes = asset.optInt("size", 0);
                            break;
                        }
                    }
                }
                JSObject out = new JSObject();
                out.put("current", current);
                out.put("latest", tag);
                out.put("url", apkUrl);
                out.put("bytes", bytes);
                out.put("notes", notes.length() > 600 ? notes.substring(0, 600) : notes);
                out.put("available", !apkUrl.isEmpty() && !tag.equalsIgnoreCase("v" + current)
                        && !tag.equalsIgnoreCase(current));
                call.resolve(out);
            } catch (Exception error) {
                call.reject("update check failed: " + error.getMessage(), error);
            }
        }).start();
    }

    /** Downloads the APK, then posts a tap-to-install notification. */
    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        final String url = call.getString("url", "");
        final String version = call.getString("version", "new");
        if (url.isEmpty()) {
            call.reject("url required");
            return;
        }
        ensureChannel();
        try {
            DownloadManager manager = (DownloadManager)
                    getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("JARVIS " + version);
            request.setDescription("Downloading the new app version…");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            File dir = new File(getContext().getExternalFilesDir(null), "updates");
            if (!dir.exists()) dir.mkdirs();
            final File target = new File(dir, "jarvis-update.apk");
            if (target.exists()) target.delete();
            request.setDestinationUri(Uri.fromFile(target));
            long id = manager.enqueue(request);

            if (downloadReceiver != null) {
                try {
                    getContext().unregisterReceiver(downloadReceiver);
                } catch (Exception ignored) {
                }
            }
            downloadReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    long done = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (done != id) return;
                    Intent install = new Intent(Intent.ACTION_VIEW);
                    Uri apk = FileProvider.getUriForFile(context,
                            context.getPackageName() + ".fileprovider", target);
                    install.setDataAndType(apk, "application/vnd.android.package-archive");
                    install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    PendingIntent open = PendingIntent.getActivity(context, 42, install,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                            ? new Notification.Builder(context, CHANNEL_ID)
                            : new Notification.Builder(context);
                    builder.setContentTitle("JARVIS update ready")
                            .setContentText("Tap to install " + version)
                            .setSmallIcon(android.R.drawable.stat_sys_download_done)
                            .setContentIntent(open)
                            .setAutoCancel(true);
                    NotificationManager nm = (NotificationManager)
                            context.getSystemService(Context.NOTIFICATION_SERVICE);
                    nm.notify(77, builder.build());
                }
            };
            ContextCompat.registerReceiver(getContext(), downloadReceiver,
                    new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                    ContextCompat.RECEIVER_NOT_EXPORTED);
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("downloadId", id);
            call.resolve(out);
        } catch (Exception error) {
            call.reject("download failed: " + error.getMessage(), error);
        }
    }

    // -------------------------------------------------------------- background

    @PluginMethod
    public void backgroundStart(PluginCall call) {
        Intent intent = new Intent(getContext(), JarvisService.class);
        intent.putExtra("text", call.getString("text", "Kaam chal raha hai…"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void backgroundStop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), JarvisService.class));
        call.resolve();
    }
}
