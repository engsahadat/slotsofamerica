<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <meta name="supported-color-schemes" content="dark light">
    <title>Verification Code - {{ $siteName ?? 'Horizon Players' }}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
    {{-- Hidden preheader — shows as the preview snippet next to the subject in the inbox list.
         Deliberately doesn't repeat the code itself (visible on a lock screen/preview otherwise). --}}
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">
        Use this one-time code to verify your account. It expires in 5 minutes.
    </div>
    <div style="display: none; max-height: 0; overflow: hidden;">&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden;">
                    <!-- Brand header -->
                    <tr>
                        <td style="padding: 28px 32px; text-align: center; background-color: #16213a; border-bottom: 1px solid #334155;">
                            <span style="font-size: 20px; line-height: 1; vertical-align: middle;">🔐</span>
                            <span style="font-size: 18px; font-weight: 800; letter-spacing: 0.5px; color: #38bdf8; vertical-align: middle; padding-left: 6px;">
                                {{ strtoupper($siteName ?? 'Horizon Players') }}
                            </span>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 36px 32px 28px 32px;">
                            <p style="margin: 0 0 4px 0; font-size: 18px; font-weight: 700; color: #f8fafc;">
                                Verify your email
                            </p>
                            <p style="margin: 0 0 28px 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                                Enter the code below to confirm it's really you. This code is valid for one use only.
                            </p>

                            <!-- Code box -->
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center" style="padding: 20px 16px; background-color: #0f172a; border-radius: 12px; border: 1px dashed #475569;">
                                        <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #38bdf8;">
                                            {{ $code }}
                                        </span>
                                    </td>
                                </tr>
                            </table>

                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 20px;">
                                <tr>
                                    <td style="padding: 12px 16px; background-color: rgba(56, 189, 248, 0.08); border-radius: 10px; border: 1px solid rgba(56, 189, 248, 0.2);">
                                        <p style="margin: 0; font-size: 13px; color: #cbd5e1; line-height: 1.5;">
                                            ⏱️ Expires in <strong style="color: #f8fafc;">5 minutes</strong>.
                                            Never share this code — {{ $siteName ?? 'Horizon Players' }} will never ask you for it by phone, chat, or email.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 32px; background-color: #0f172a; text-align: center; border-top: 1px solid #334155;">
                            <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                                Didn't request this? You can safely ignore this email — your account is still secure.
                            </p>
                            <p style="margin: 10px 0 0 0; font-size: 11px; color: #475569;">
                                &copy; {{ date('Y') }} {{ $siteName ?? 'Horizon Players' }}. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
