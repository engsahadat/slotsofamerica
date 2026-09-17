<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WithdrawMethodField extends Model
{
    use HasFactory;

    protected $fillable = [
        'method_id',
        'field_name',
        'field_label',
        'field_type',
        'placeholder',
        'is_required',
        'validation_rule',
        'sort_order',
    ];

    protected $casts = [
        'is_required' => 'boolean',
    ];

    public function method()
    {
        return $this->belongsTo(WithdrawMethod::class, 'method_id');
    }
}
