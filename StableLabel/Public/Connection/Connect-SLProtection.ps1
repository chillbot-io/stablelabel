function Connect-SLProtection {
    <#
    .SYNOPSIS
        Connects to the Azure Information Protection service.
    .DESCRIPTION
        Wraps Connect-AipService. This backend is only supported on Windows
        because the AIPService module requires Windows PowerShell 5.1 or
        PowerShell 7+ on Windows. A clear error is thrown on non-Windows
        platforms or when the AIPService module is not installed.
    .PARAMETER AsJson
        Return the connection result as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Connect-SLProtection
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [switch]$AsJson
    )

    process {
        # Platform check
        if (-not $IsWindows) {
            throw "Connect-SLProtection is only supported on Windows. " +
                  "The AIPService module requires Windows PowerShell 5.1 or PowerShell 7+ on Windows. " +
                  "Current platform is not supported."
        }

        # Module availability check
        if (-not (Get-Module -ListAvailable -Name AIPService)) {
            throw "The AIPService module is not installed. " +
                  "Install it by running: Install-Module -Name AIPService -Force -AllowClobber " +
                  "from an elevated PowerShell session."
        }

        try {
            Write-Verbose "Connecting to Azure Information Protection service."

            Connect-AipService -ErrorAction Stop

            $script:SLConnection['ProtectionConnected']        = $true
            $script:SLConnection['ConnectedAt']['Protection']  = [datetime]::UtcNow

            $result = [PSCustomObject]@{
                Status      = 'Connected'
                Backend     = 'Protection'
                ConnectedAt = $script:SLConnection['ConnectedAt']['Protection']
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth 20
            }

            return $result
        }
        catch {
            $script:SLConnection['ProtectionConnected'] = $false
            throw "Failed to connect to AIP Service: $_"
        }
    }
}
