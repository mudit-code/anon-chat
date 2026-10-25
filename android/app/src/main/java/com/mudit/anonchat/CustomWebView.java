package com.mudit.anonchat;

import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.AttributeSet;
import android.util.Base64;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.webkit.JavascriptInterface;
import androidx.core.view.inputmethod.EditorInfoCompat;
import androidx.core.view.inputmethod.InputConnectionCompat;
import androidx.core.view.inputmethod.InputContentInfoCompat;
import com.getcapacitor.CapacitorWebView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class CustomWebView extends CapacitorWebView {

    private volatile String pendingBase64 = "";
    private volatile String pendingMime = "image/png";
    private volatile String pendingName = "keyboard_media";

    public class KeyboardBridge {
        @JavascriptInterface
        public String getPendingData() {
            String data = pendingBase64;
            pendingBase64 = "";
            return data != null ? data : "";
        }

        @JavascriptInterface
        public String getPendingMime() {
            return pendingMime != null ? pendingMime : "image/png";
        }

        @JavascriptInterface
        public String getPendingName() {
            return pendingName != null ? pendingName : "keyboard_media";
        }

        @JavascriptInterface
        public void clearPending() {
            pendingBase64 = "";
            pendingMime = "image/png";
            pendingName = "keyboard_media";
        }
    }

    public CustomWebView(Context context) {
        super(context, null);
        initBridge();
    }

    public CustomWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
        initBridge();
    }

    public CustomWebView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs);
        initBridge();
    }

    private void initBridge() {
        addJavascriptInterface(new KeyboardBridge(), "AndroidKeyboardBridge");
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection ic = super.onCreateInputConnection(outAttrs);
        if (ic == null) {
            return null;
        }

        // Advertise image/GIF/sticker MIME types to IME (Gboard, Samsung Keyboard, etc.)
        String[] mimeTypes = new String[]{
            "image/gif",
            "image/png",
            "image/jpeg",
            "image/webp"
        };
        EditorInfoCompat.setContentMimeTypes(outAttrs, mimeTypes);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
            outAttrs.contentMimeTypes = mimeTypes;
        }

        // Ensure EditorInfo signals a multi-line text input field so Gboard shows GIF/sticker tabs
        if (outAttrs.inputType == 0 || outAttrs.inputType == InputType.TYPE_NULL) {
            outAttrs.inputType = InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES;
        } else {
            outAttrs.inputType |= InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE;
        }
        outAttrs.imeOptions |= EditorInfo.IME_ACTION_SEND | EditorInfo.IME_FLAG_NO_EXTRACT_UI;

        InputConnectionCompat.OnCommitContentListener callback = new InputConnectionCompat.OnCommitContentListener() {
            @Override
            public boolean onCommitContent(InputContentInfoCompat inputContentInfo, int flags, Bundle opts) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1 &&
                    (flags & InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION) != 0) {
                    try {
                        inputContentInfo.requestPermission();
                    } catch (Exception e) {
                        return false;
                    }
                }

                new Thread(() -> {
                    try {
                        Uri contentUri = inputContentInfo.getContentUri();
                        String mimeType = "image/png";
                        if (inputContentInfo.getDescription() != null && inputContentInfo.getDescription().getMimeTypeCount() > 0) {
                            mimeType = inputContentInfo.getDescription().getMimeType(0);
                        }
                        String label = "keyboard_sticker";
                        if (inputContentInfo.getDescription() != null && inputContentInfo.getDescription().getLabel() != null) {
                            label = inputContentInfo.getDescription().getLabel().toString();
                        }

                        InputStream is = getContext().getContentResolver().openInputStream(contentUri);
                        if (is != null) {
                            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                            byte[] data = new byte[8192];
                            int nRead;
                            int totalRead = 0;
                            final int MAX_SIZE = 15 * 1024 * 1024; // 15 MB cap

                            while ((nRead = is.read(data, 0, data.length)) != -1) {
                                totalRead += nRead;
                                if (totalRead > MAX_SIZE) {
                                    is.close();
                                    return;
                                }
                                buffer.write(data, 0, nRead);
                            }
                            is.close();

                            byte[] bytes = buffer.toByteArray();
                            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                            final String dataUrl = "data:" + mimeType + ";base64," + base64;
                            final String finalMime = mimeType;
                            final String finalName = label;

                            pendingBase64 = dataUrl;
                            pendingMime = finalMime;
                            pendingName = finalName;

                            post(() -> {
                                // Trigger via JavaScriptInterface (bypasses Android IPC 1MB buffer limit entirely)
                                String js = "if (typeof window.handleAndroidKeyboardContent === 'function') { " +
                                            "    window.handleAndroidKeyboardContent(); " +
                                            "} else { " +
                                            "    window.dispatchEvent(new CustomEvent('keyboardContentReady')); " +
                                            "}";
                                evaluateJavascript(js, null);
                            });
                        }
                    } catch (Exception ex) {
                        ex.printStackTrace();
                    } finally {
                        try {
                            inputContentInfo.releasePermission();
                        } catch (Exception ignored) {}
                    }
                }).start();

                return true;
            }
        };

        return InputConnectionCompat.createWrapper(ic, outAttrs, callback);
    }
}
