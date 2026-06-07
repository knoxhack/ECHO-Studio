# Create a self-signed code-signing certificate for local development testing.
# Run as Administrator if you want to install to the Trusted Root store.
# The resulting .pfx can be used with electron-builder for test signing.

$certName = "ECHO Platform Dev"
$password = ConvertTo-SecureString -String "echodev123" -Force -AsPlainText
$outDir = "$PSScriptRoot\..\build\certs"
$certPath = "$outDir\dev-cert.pfx"

New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=$certName, O=ECHO Platform, C=US" `
  -KeyUsage DigitalSignature `
  -FriendlyName "ECHO Addon Studio Dev Cert" `
  -CertStoreLocation Cert:\CurrentUser\My `
  -NotAfter (Get-Date).AddYears(5)

Export-PfxCertificate `
  -Cert $cert `
  -FilePath $certPath `
  -Password $password | Out-Null

Write-Host ""
Write-Host "Created self-signed certificate:" -ForegroundColor Green
Write-Host "  Subject : $($cert.Subject)"
Write-Host "  Thumbprint: $($cert.Thumbprint)"
Write-Host "  PFX file: $certPath"
Write-Host "  Password: echodev123"
Write-Host ""
Write-Host "To use with electron-builder, set these environment variables before building:"
Write-Host "  `$env:CSC_LINK = '$certPath'"
Write-Host "  `$env:CSC_KEY_PASSWORD = 'echodev123'"
Write-Host ""
Write-Host "NOTE: Windows will still show 'Unknown publisher' unless this cert is installed"
Write-Host "in the Trusted Root Certification Authorities store (requires Admin)."
