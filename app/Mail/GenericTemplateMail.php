<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** Renders raw, already-interpolated HTML — used for admin-authored Email Templates and their "send test" action. */
class GenericTemplateMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $emailSubject, public string $htmlBody)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->emailSubject);
    }

    public function content(): Content
    {
        return new Content(htmlString: $this->htmlBody);
    }

    public function attachments(): array
    {
        return [];
    }
}
