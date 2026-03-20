function Connect-SLCompliance {
    <#
    .SYNOPSIS
        Connects to the Security & Compliance PowerShell session.
    .DESCRIPTION
        Wraps Connect-IPPSSession to establish a connection to the Microsoft
        Purview compliance center. Tracks the session start time so the module
        can proactively recycle the session before the server-side idle timeout.

        UserPrincipalName is optional. When provided, it pre-populates the
        sign-in dialog. When omitted (e.g. device-code flow), the user is
        prompted interactively and the UPN is not pre-filled.

        For device-code authentication, Connect-ExchangeOnline is used with
        the Security & Compliance endpoint URI, because Connect-IPPSSession
        does not support the -Device parameter.
    .PARAMETER UserPrincipalName
        The UPN of the account to authenticate with. Optional — when provided
        it pre-populates the sign-in dialog.
    .PARAMETER UseDeviceCode
        Use the device-code authentication flow instead of interactive browser
        sign-in. Required when running from the StableLabel GUI or other
        non-interactive environments.
    .PARAMETER AsJson
        Return the connection result as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Connect-SLCompliance -UserPrincipalName admin@contoso.com
    .EXAMPLE
        Connect-SLCompliance -UseDeviceCode
    .EXAMPLE
        Connect-SLCompliance -UserPrincipalName admin@contoso.com -UseDeviceCode
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [ValidateNotNullOrEmpty()]
        [string]$UserPrincipalName,

        [Parameter()]
        [switch]$UseDeviceCode,

        [Parameter()]
        [switch]$AsJson
    )

    process {
        try {
            $displayUpn = if ($UserPrincipalName) { $UserPrincipalName } else { '(interactive)' }
            Write-Verbose "Connecting to Security & Compliance as $displayUpn."

            if ($UseDeviceCode) {
                # Connect-IPPSSession does not support -Device.
                # Use Connect-ExchangeOnline with the S&C endpoint instead.
                $exoParams = @{
                    Device                          = $true
                    ConnectionUri                   = 'https://ps.compliance.protection.outlook.com/powershell-liveid/'
                    AzureADAuthorizationEndpointUri = 'https://login.microsoftonline.com/organizations'
                    ShowBanner                      = $false
                    ErrorAction                     = 'Stop'
                }
                if ($UserPrincipalName) {
                    $exoParams['UserPrincipalName'] = $UserPrincipalName
                }
                Connect-ExchangeOnline @exoParams
            }
            else {
                # Standard interactive flow via Connect-IPPSSession
                $ippsParams = @{
                    ErrorAction = 'Stop'
                }
                if ($UserPrincipalName) {
                    $ippsParams['UserPrincipalName'] = $UserPrincipalName
                }
                Connect-IPPSSession @ippsParams
            }

            $now = [datetime]::UtcNow

            $script:SLConnection['ComplianceConnected']       = $true
            if ($UserPrincipalName) {
                $script:SLConnection['UserPrincipalName']     = $UserPrincipalName
            }
            $script:SLConnection['ConnectedAt']['Compliance'] = $now
            $script:SLConnection['ComplianceCommandCount']    = 0
            $script:SLConnection['ComplianceSessionStart']    = $now

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
            throw [System.Management.Automation.RuntimeException]::new(
                "Failed to connect to Security & Compliance: $_",
                $_.Exception
            )
        }
    }
}
