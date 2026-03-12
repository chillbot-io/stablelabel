function Connect-SLCompliance {
    <#
    .SYNOPSIS
        Connects to the Security & Compliance PowerShell session.
    .DESCRIPTION
        Wraps Connect-IPPSSession to establish a connection to the Microsoft
        Purview compliance center. Tracks the session start time so the module
        can proactively recycle the session before the server-side idle timeout.
    .PARAMETER UserPrincipalName
        The UPN of the account to authenticate with. Required so that
        Connect-IPPSSession can pre-populate the sign-in dialog.
    .PARAMETER AsJson
        Return the connection result as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Connect-SLCompliance -UserPrincipalName admin@contoso.com
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$UserPrincipalName,

        [Parameter()]
        [switch]$AsJson
    )

    process {
        try {
            Write-Verbose "Connecting to Security & Compliance as $UserPrincipalName."

            Connect-IPPSSession -UserPrincipalName $UserPrincipalName -ErrorAction Stop

            $now = [datetime]::UtcNow

            $script:SLConnection['ComplianceConnected']     = $true
            $script:SLConnection['UserPrincipalName']       = $UserPrincipalName
            $script:SLConnection['ConnectedAt']['Compliance'] = $now
            $script:SLConnection['ComplianceCommandCount']  = 0
            $script:SLConnection['ComplianceSessionStart']  = $now

            $result = [PSCustomObject]@{
                Status            = 'Connected'
                Backend           = 'Compliance'
                UserPrincipalName = $UserPrincipalName
                ConnectedAt       = $now
                SessionStart      = $now
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth 20
            }

            return $result
        }
        catch {
            $script:SLConnection['ComplianceConnected'] = $false
            throw "Failed to connect to Security & Compliance: $_"
        }
    }
}
