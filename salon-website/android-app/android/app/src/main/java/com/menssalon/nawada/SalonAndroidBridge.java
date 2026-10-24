package com.menssalon.nawada;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.ContactsContract;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

/** Small Android-native actions used by the bundled salon page. */
public final class SalonAndroidBridge {
    private final Activity activity;

    public SalonAndroidBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void saveContact() {
        activity.runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_INSERT);
            intent.setType(ContactsContract.Contacts.CONTENT_TYPE);
            intent.putExtra(ContactsContract.Intents.Insert.NAME, "Men's Salon - Nawada");
            intent.putExtra(ContactsContract.Intents.Insert.PHONE, "+91 96080 87035");
            intent.putExtra(
                ContactsContract.Intents.Insert.PHONE_TYPE,
                ContactsContract.CommonDataKinds.Phone.TYPE_WORK
            );
            intent.putExtra(
                ContactsContract.Intents.Insert.POSTAL,
                "Sudama Nagar, Nawada, Bihar 805110, India"
            );
            intent.putExtra(
                ContactsContract.Intents.Insert.POSTAL_TYPE,
                ContactsContract.CommonDataKinds.StructuredPostal.TYPE_WORK
            );
            intent.putExtra(
                ContactsContract.Intents.Insert.NOTES,
                "Barber: Nitish Jatav. WhatsApp booking: https://wa.me/919608087035"
            );
            try {
                activity.startActivity(intent);
            } catch (ActivityNotFoundException error) {
                Toast.makeText(activity, "No contacts app is available.", Toast.LENGTH_LONG).show();
            }
        });
    }

    @JavascriptInterface
    public void share(String title, String message, String url) {
        activity.runOnUiThread(() -> {
            String safeTitle = title == null || title.isEmpty() ? "Share Men's Salon" : title;
            String shareText = (message == null ? "" : message.trim());
            if (url != null && !url.isEmpty() && !shareText.contains(url)) {
                shareText = shareText.isEmpty() ? url : shareText + "\n" + url;
            }

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/plain");
            intent.putExtra(Intent.EXTRA_SUBJECT, safeTitle);
            intent.putExtra(Intent.EXTRA_TEXT, shareText);
            try {
                activity.startActivity(Intent.createChooser(intent, safeTitle));
            } catch (ActivityNotFoundException error) {
                Toast.makeText(activity, "No sharing app is available.", Toast.LENGTH_LONG).show();
            }
        });
    }
}
