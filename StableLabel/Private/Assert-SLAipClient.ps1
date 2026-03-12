function Assert-SLAipClient {
    <#
    .SYNOPSIS
        Verifies the AIP unified labeling client is available for on-prem file labeling.
    .DESCRIPTION
        Checks for the AzureInformationProtection module (AIP unified labeling client)
        which provides Set-AIPFileLabel, Get-AIPFileStatus, and Remove-AIPFileLabel.
        Falls back to checking for the AIPService module cmdlets if the unified client
        is not available. Throws a terminating error if neither is found.
    #>
    [CmdletBinding()]
    param()

    if (-not $IsWindows) {
        throw "AIP file labeling requires Windows. The AzureInformationProtection module is not available on $($PSVersionTable.OS)."
    }

    # Check for unified labeling client (preferred)
    $aipModule = Get-Module -ListAvailable -Name 'AzureInformationProtection' -ErrorAction SilentlyContinue

    if ($aipModule) {
        if (-not (Get-Module -Name 'AzureInformationProtection')) {
            Import-Module AzureInformationProtection -ErrorAction Stop
        }

        $script:SLAipClientType = 'UnifiedLabeling'
        Write-Verbose "AIP unified labeling client available (v$($aipModule.Version))."
        return
    }

    # Fallback: check if Set-AIPFileLabel is available from any loaded module
    $aipCmd = Get-Command -Name 'Set-AIPFileLabel' -ErrorAction SilentlyContinue
    if ($aipCmd) {
        $script:SLAipClientType = 'Legacy'
        Write-Verbose "AIP file labeling available via legacy module."
        return
    }

    throw @"
AIP unified labeling client not found. Install it to label files on CIFS/SMB shares.

Install: https://learn.microsoft.com/en-us/azure/information-protection/rms-client/install-unifiedlabelingclient-app
Module:  AzureInformationProtection

Alternative: Install via PowerShell Gallery (if available):
  Install-Module AzureInformationProtection
"@
}
