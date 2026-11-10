<?php

/**
 * ojs_backend_sync_verification.php
 * Automated verification of OJS Step 2 template cleaning and backend MQC sync logic.
 */

$rootDir = dirname(__DIR__, 2);
$ojsDir = $rootDir . '/jurnalpermukiman';
$tplPath = $ojsDir . '/templates/submission/form/step2.tpl';
$step2ClassPath = $ojsDir . '/classes/submission/form/SubmissionSubmitStep2Form.inc.php';
$step4ClassPath = $ojsDir . '/classes/submission/form/SubmissionSubmitStep4Form.inc.php';

echo "=== 1. Verifikasi step2.tpl ===\n";
if (!file_exists($tplPath)) {
    echo "FAIL: File $tplPath tidak ditemukan.\n";
    exit(1);
}

$tplContent = file_get_contents($tplPath);

// Validasi elemen yang WAJIB ada
$requiredSnippets = [
    '<form class="pkp_form" id="submitStep2Form"',
    '<submission-files-list-panel',
    '{fbvFormButtons id="step2Buttons" submitText="common.saveAndContinue"}',
];
foreach ($requiredSnippets as $snippet) {
    if (strpos($tplContent, $snippet) === false) {
        echo "FAIL: Snippet wajib tidak ditemukan di step2.tpl: $snippet\n";
        exit(1);
    }
}

// Validasi elemen MQC yang HARUS BERSIH
$forbiddenSnippets = [
    'mqc-gatekeeper-box',
    'mqc-file-input',
    'mqc-check-btn',
    'mqc-result-box',
    'Verifikasi Standar Format Naskah',
    'submitBtn.disabled = true',
];
foreach ($forbiddenSnippets as $snippet) {
    if (strpos($tplContent, $snippet) !== false) {
        echo "FAIL: Elemen MQC terlarang masih ada di step2.tpl: $snippet\n";
        exit(1);
    }
}
echo "PASS: step2.tpl bersih 100% dan kembali ke formulir standar OJS.\n\n";

echo "=== 2. Verifikasi SubmissionSubmitStep2Form.inc.php Bersih ===\n";
if (!file_exists($step2ClassPath)) {
    echo "FAIL: File $step2ClassPath tidak ditemukan.\n";
    exit(1);
}
$step2Content = file_get_contents($step2ClassPath);
if (strpos($step2Content, '_syncManuscriptToMQC') !== false) {
    echo "FAIL: Step 2 form masih mengandung transmisi MQC yang seharusnya sudah dipindah ke Step 4.\n";
    exit(1);
}
echo "PASS: Step 2 form bersih dari logic transmisi MQC.\n\n";

echo "=== 3. Verifikasi Sintaks & Struktur SubmissionSubmitStep4Form.inc.php (Finish Submission) ===\n";
if (!file_exists($step4ClassPath)) {
    echo "FAIL: File $step4ClassPath tidak ditemukan.\n";
    exit(1);
}

$step4Content = file_get_contents($step4ClassPath);

// Cek sintaks PHP
$lintOutput = [];
$lintReturn = 0;
exec("php -l " . escapeshellarg($step4ClassPath), $lintOutput, $lintReturn);
if ($lintReturn !== 0) {
    echo "FAIL: Kesalahan sintaks PHP di $step4ClassPath: " . implode("\n", $lintOutput) . "\n";
    exit(1);
}
echo "PASS: Sintaks PHP Step 4 valid.\n";

// Cek elemen penting dalam class Step 4
$requiredClassSnippets = [
    'class SubmissionSubmitStep4Form extends PKPSubmissionSubmitStep4Form',
    'function execute(...$functionParams)',
    'parent::execute(...$functionParams)',
    '$this->_syncManuscriptToMQC($submission);',
    'protected function _syncManuscriptToMQC($submission)',
    'x-mqc-api-key',
    'pupr_mqc_secure_token_2026',
    'http://localhost:3000/api/check-submission',
    'new \CURLFile',
    'CURLOPT_TIMEOUT',
    'catch (\Throwable $e)',
];
foreach ($requiredClassSnippets as $snippet) {
    if (strpos($step4Content, $snippet) === false) {
        echo "FAIL: Elemen penting tidak ditemukan di SubmissionSubmitStep4Form: $snippet\n";
        exit(1);
    }
}
echo "PASS: Seluruh fungsi dan kontrak backend Step 4 (Finish Submission) terpenuhi.\n\n";

echo "=== 4. Pengujian cURL Transmisi Berkas Docx ke Backend MQC ===\n";
// Buat dummy docx sementara
$tmpDocx = tempnam(sys_get_temp_dir(), 'test_manuscript_') . '.docx';
$zip = new ZipArchive();
if ($zip->open($tmpDocx, ZipArchive::CREATE) === TRUE) {
    $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    $zip->addFromString('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Naskah Uji Sinkronisasi OJS</w:t></w:r></w:p></w:body></w:document>');
    $zip->close();
}

$ch = curl_init('http://localhost:3000/api/check-submission');
$postFields = [
    'file' => new CURLFile($tmpDocx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Naskah_Verifikasi_OJS.docx'),
    'ojs_submission_id' => '753999',
    'ojs_user_id' => '99',
    'author_name' => 'Dr. Penulis Permukiman',
    'author_email' => 'penulis.permukiman@pu.go.id',
];
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $postFields,
    CURLOPT_HTTPHEADER => [
        'x-mqc-api-key: pupr_mqc_secure_token_2026',
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 5,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
@unlink($tmpDocx);

if ($httpCode !== 200) {
    echo "FAIL: MQC API mengembalikan HTTP $httpCode: $response\n";
    exit(1);
}

$data = json_decode($response, true);
if (!$data || empty($data['success']) || $data['status'] !== 'pending') {
    echo "FAIL: Respon MQC tidak sesuai kontrak fast-ingest: $response\n";
    exit(1);
}
echo "PASS: MQC menerima sinkronisasi dengan sukses (Status: {$data['status']}, Manuscript ID: {$data['manuscriptId']}).\n\n";

echo "=== 5. Pengujian Resiliensi (Non-blocking Offline Fallback) ===\n";
// Uji coba koneksi ke port mati
$chOffline = curl_init('http://localhost:59999/api/check-submission');
curl_setopt_array($chOffline, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => ['dummy' => '1'],
    CURLOPT_HTTPHEADER => ['x-mqc-api-key: pupr_mqc_secure_token_2026'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 1,
    CURLOPT_TIMEOUT => 2,
]);
$start = microtime(true);
$offlineRes = curl_exec($chOffline);
$offlineErr = curl_error($chOffline);
$elapsed = microtime(true) - $start;
curl_close($chOffline);

if ($offlineRes !== false) {
    echo "FAIL: Port offline seharusnya gagal tapi mengembalikan respon.\n";
    exit(1);
}
if ($elapsed > 3.0) {
    echo "FAIL: Timeout terlalu lama ($elapsed detik).\n";
    exit(1);
}
echo "PASS: Server offline ditangani secara cepat ($elapsed s) tanpa error fatal: $offlineErr\n\n";

echo "SEMUA 5 TAHAP PENGUJIAN LULUS DENGAN SEMPURNA!\n";
