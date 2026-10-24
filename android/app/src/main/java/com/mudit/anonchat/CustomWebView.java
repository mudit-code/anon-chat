package com.mudit.anonchat;

import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.AttributeSet;
import android.util.Base64;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import androidx.core.view.inputmethod.EditorInfoCompat;
import androidx.core.view.inputmethod.InputConnectionCompat;
import androidx.core.view.inputmethod.InputContentInfoCompat;
import com.getcapacitor.CapacitorWebView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class CustomWebView extends CapacitorWebView {

    public CustomWebView(Context context) {
        super(context, null);
    }

    public CustomWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public CustomWebView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection ic = super.onCreateInputConnection(outAttrs);
        if (ic == null) {
            return null;
        }

        // Advertise image/GIF/sticker MIME types to IME (Gboard, Samsung Keyboard, etc.)
        EditorInfoCompat.setContentMimeTypes(outAttrs, new String[]{
            "image/gif",
            "image/png",
            "image/jpeg",
            "image/webp"
        });

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
                            final int MAX_SIZE = 10 * 1024 * 1024; // 10 MB cap

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

                            post(() -> {
                                String safeBase64 = dataUrl.replace("\\", "\\\\").replace("'", "\\'");
                                String safeMime = finalMime.replace("'", "\\'");
                                String safeName = finalName.replace("'", "\\'");
                                String js = "if (typeof window.handleKeyboardContent === 'function') { window.handleKeyboardContent({ mimeType: '" + safeMime + "', base64: '" + safeBase64 + "', name: '" + safeName + "' }); } " +
                                            "window.dispatchEvent(new CustomEvent('keyboardContent', { detail: { mimeType: '" + safeMime + "', base64: '" + safeBase64 + "', name: '" + safeName + "' } }));";
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
