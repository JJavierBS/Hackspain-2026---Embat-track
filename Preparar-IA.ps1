param(
    [ValidateSet('glm5.3', 'deepseek-v4-flash')]
    [string]$Modelo = 'glm5.3',
    [switch]$GuardarLocal
)
$ErrorActionPreference = 'Stop'
Write-Host 'Detén primero la aplicación local. Se enviarán solo indicadores agregados y textos del catálogo a Helmcode.'
Write-Host 'Alcance por defecto: GROUP_0039 y GROUP_0101, julio 2026, tres perfiles; como máximo seis solicitudes, sin reintentos automáticos.'
$confirmacion = Read-Host '¿Autorizas este envío y el consumo de tokens? Escribe SI'
if ($confirmacion -cne 'SI') { exit 0 }
$anteriorClave = $env:HELMCODE_API_KEY
$anteriorModelo = $env:HELMCODE_MODEL
$secreto = Read-Host 'Clave API de Helmcode (no el código de canje)' -AsSecureString
$puntero = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secreto)
try {
    $env:HELMCODE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($puntero)
    $env:HELMCODE_MODEL = $Modelo
    if ($GuardarLocal) {
        & node (Join-Path $PSScriptRoot 'scripts/local.mjs') configure-ia
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la configuración privada. No se han sobrescrito archivos.' }
    }
    & node (Join-Path $PSScriptRoot 'scripts/local.mjs') prepare-ia
    if ($LASTEXITCODE -ne 0) { throw 'La preparación no terminó correctamente. Revisa el estado del proveedor; no compartas la clave.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($puntero)
    $secreto.Dispose()
    $env:HELMCODE_API_KEY = $anteriorClave
    $env:HELMCODE_MODEL = $anteriorModelo
}
Write-Host "Preparación terminada. Inicia con el mismo modelo: `$env:HELMCODE_MODEL='$Modelo'; node scripts/local.mjs start"
