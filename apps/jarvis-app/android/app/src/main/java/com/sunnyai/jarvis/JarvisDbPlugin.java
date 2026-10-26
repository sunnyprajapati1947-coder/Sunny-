package com.sunnyai.jarvis;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * A small, dependency-free SQLite bridge. The web layer keeps memories,
 * documents and the task history here, so the data survives updates and is
 * never stored in a place another app can read.
 */
@CapacitorPlugin(name = "JarvisDb")
public class JarvisDbPlugin extends Plugin {

    private SQLiteDatabase db;

    private SQLiteDatabase database() {
        if (db != null && db.isOpen()) return db;
        Context ctx = getContext();
        db = ctx.openOrCreateDatabase("jarvis.db", Context.MODE_PRIVATE, null);
        db.execSQL("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS memory (id TEXT PRIMARY KEY, text TEXT, kind TEXT, source TEXT, created TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS docs (id TEXT PRIMARY KEY, title TEXT, body TEXT, source TEXT, created TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, kind TEXT, title TEXT, body TEXT, created TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT, created TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, project TEXT, name TEXT, body TEXT, updated TEXT)");
        return db;
    }

    private String[] bind(JSArray args) {
        if (args == null) return new String[0];
        String[] out = new String[args.length()];
        for (int i = 0; i < args.length(); i += 1) {
            Object value = args.opt(i);
            out[i] = value == null || value == JSONObject.NULL ? null : String.valueOf(value);
        }
        return out;
    }

    @PluginMethod
    public void exec(PluginCall call) {
        String sql = call.getString("sql", "");
        if (sql.isEmpty()) {
            call.reject("sql required");
            return;
        }
        try {
            database().execSQL(sql, bind(call.getArray("args")));
            JSObject out = new JSObject();
            out.put("ok", true);
            call.resolve(out);
        } catch (Exception error) {
            call.reject("sql failed: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void query(PluginCall call) {
        String sql = call.getString("sql", "");
        if (sql.isEmpty()) {
            call.reject("sql required");
            return;
        }
        Cursor cursor = null;
        try {
            cursor = database().rawQuery(sql, bind(call.getArray("args")));
            JSArray rows = new JSArray();
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                String[] names = cursor.getColumnNames();
                for (int i = 0; i < names.length; i += 1) {
                    switch (cursor.getType(i)) {
                        case Cursor.FIELD_TYPE_INTEGER:
                            row.put(names[i], cursor.getLong(i));
                            break;
                        case Cursor.FIELD_TYPE_FLOAT:
                            row.put(names[i], cursor.getDouble(i));
                            break;
                        case Cursor.FIELD_TYPE_NULL:
                            row.put(names[i], JSONObject.NULL);
                            break;
                        default:
                            row.put(names[i], cursor.getString(i));
                            break;
                    }
                }
                rows.put(row);
            }
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("rows", rows);
            call.resolve(out);
        } catch (Exception error) {
            call.reject("query failed: " + error.getMessage(), error);
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    @PluginMethod
    public void stats(PluginCall call) {
        JSObject out = new JSObject();
        try {
            android.database.Cursor cursor = database().rawQuery(
                    "SELECT (SELECT COUNT(*) FROM memory), (SELECT COUNT(*) FROM docs), (SELECT COUNT(*) FROM history)", null);
            if (cursor.moveToFirst()) {
                out.put("memories", cursor.getInt(0));
                out.put("documents", cursor.getInt(1));
                out.put("history", cursor.getInt(2));
            }
            cursor.close();
            out.put("ok", true);
            out.put("path", getContext().getDatabasePath("jarvis.db").getAbsolutePath());
        } catch (Exception error) {
            out.put("ok", false);
            out.put("error", error.getMessage());
        }
        call.resolve(out);
    }
}
