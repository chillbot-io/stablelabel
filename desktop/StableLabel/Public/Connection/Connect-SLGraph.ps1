function Connect-SLGraph {
    <#
    .SYNOPSIS
        Connects to Microsoft Graph with the scopes required by StableLabel.
    .DESCRIPTION
        Wraps Connect-MgGraph, requesting the scopes needed for sensitivity-label
        and site operations. After connecting it stores context information in the
        module-scoped $script:SLConnection hashtable.
    .PARAMETER TenantId
        Optional Azure AD / Entra ID tenant ID to connect to. When omitted the
        default tenant for the signed-in account is used.
    .PARAMETER Scopes
        Additional Microsoft Graph scopes to request beyond the StableLabel
        defaults. The defaults are always included.
    .PARAMETER UseDeviceCode
        Use the device-code authentication flow instead of interactive browser
        sign-in. The command will output a URL and code that the user must enter
        in a browser to complete authentication. This is required when running
        in non-interactive environments (e.g. the StableLabel GUI).
    .PARAMETER AsJson
        Return the connection result as a JSON string instead of a PSCustomObject.
    .EXAMPLE
        Connect-SLGraph
    .EXAMPLE
        Connect-SLGraph -TenantId 'contoso.onmicrosoft.com'
    .EXAMPLE
        Connect-SLGraph -UseDeviceCode -AsJson
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$TenantId,

        [Parameter()]
        [string[]]$Scopes,

        [Parameter()]
        [switch]$UseDeviceCode,

        [Parameter()]
        [switch]$AsJson
    )

    begin {
        $requiredScopes = @(
            'InformationProtectionPolicy.Read.All'
            'Files.ReadWrite.All'
            'Sites.ReadWrite.All'
            'Group.Read.All'
            'User.Read'
            'offline_access'
        )

        if ($Scopes) {
            $requiredScopes = @($requiredScopes) + @($Scopes) | Select-Object -Unique
        }
    }

    process {
        try {
            Write-Verbose "Connecting to Microsoft Graph with $($requiredScopes.Count) scopes."

            $effectiveTenant = if ($TenantId) { $TenantId } else { 'organizations' }

            if ($UseDeviceCode) {
                # ── MSAL direct device-code flow ──────────────────────────────
                # Connect-MgGraph -UseDeviceCode writes the device-code prompt
                # through the PowerShell host UI, which block-buffers stdout
                # when it is a pipe (e.g. the StableLabel Electron GUI).  No
                # amount of Console.SetOut / AutoFlush / reflection fixes this
                # because ConsoleHost may cache the original writers or use
                # internal write paths that bypass Console entirely.
                #
                # Instead we call MSAL directly, control the device-code
                # callback ourselves, and write the prompt to the *raw* stdout
                # stream (OS file-descriptor level — zero .NET buffering).
                # Then we pass the token to Connect-MgGraph -AccessToken.
                # ──────────────────────────────────────────────────────────────

                # Load MSAL from the Graph module's bundled dependencies
                $graphMod = Get-Module Microsoft.Graph.Authentication -ListAvailable |
                    Sort-Object Version -Descending | Select-Object -First 1
                if (-not $graphMod) {
                    throw 'Microsoft.Graph.Authentication module not found. Run Install-Module Microsoft.Graph.Authentication.'
                }
                $msalDll = Get-ChildItem -Path $graphMod.ModuleBase -Recurse -Filter 'Microsoft.Identity.Client.dll' |
                    Select-Object -First 1
                if (-not $msalDll) {
                    throw 'MSAL library (Microsoft.Identity.Client.dll) not found inside Microsoft.Graph.Authentication module.'
                }
                Add-Type -Path $msalDll.FullName -ErrorAction SilentlyContinue

                # Microsoft Graph Command Line Tools — well-known public client ID
                $clientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e'
                $authority = "https://login.microsoftonline.com/$effectiveTenant"

                $appBuilder = [Microsoft.Identity.Client.PublicClientApplicationBuilder]::Create($clientId)
                $appBuilder = $appBuilder.WithAuthority($authority)
                $appBuilder = $appBuilder.WithDefaultRedirectUri()
                $msalApp    = $appBuilder.Build()

                # Device-code callback: write the prompt to the raw stdout
                # stream so the Electron bridge can detect it immediately.
                $deviceCodeCallback = [System.Func[Microsoft.Identity.Client.DeviceCodeResult, System.Threading.Tasks.Task]]{
                    param($dcr)
                    $raw = [Console]::OpenStandardOutput()
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($dcr.Message + [System.Environment]::NewLine)
                    $raw.Write($bytes, 0, $bytes.Length)
                    $raw.Flush()
                    return [System.Threading.Tasks.Task]::CompletedTask
                }

                Write-Verbose 'Starting MSAL device-code flow...'
                $tokenResult = $msalApp.AcquireTokenWithDeviceCode($requiredScopes, $deviceCodeCallback).
                    ExecuteAsync().GetAwaiter().GetResult()

                # Feed the token to Connect-MgGraph so the rest of the SDK
                # (Get-MgContext, etc.) works normally.
                $secureToken = $tokenResult.AccessToken | ConvertTo-SecureString -AsPlainText -Force
                Connect-MgGraph -AccessToken $secureToken -NoWelcome -ErrorAction Stop
            }
            else {
                $connectParams = @{
                    Scopes       = $requiredScopes
                    NoWelcome    = $true
                    ContextScope = 'Process'
                    TenantId     = $effectiveTenant
                }
                Connect-MgGraph @connectParams -ErrorAction Stop
            }

            $context = Get-MgContext -ErrorAction Stop

            $script:SLConnection['GraphConnected']    = $true
            $script:SLConnection['UserPrincipalName'] = $context.Account
            $script:SLConnection['TenantId']          = $context.TenantId
            $script:SLConnection['UseDeviceCode']     = [bool]$UseDeviceCode
            $script:SLConnection['ConnectedAt']['Graph'] = [datetime]::UtcNow

            $result = [PSCustomObject]@{
                Status            = 'Connected'
                Backend           = 'Graph'
                UserPrincipalName = $context.Account
                TenantId          = $context.TenantId
                Scopes            = $requiredScopes
                ConnectedAt       = $script:SLConnection['ConnectedAt']['Graph']
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth 20
            }

            return $result
        }
        catch {
            $script:SLConnection['GraphConnected'] = $false
            throw "Failed to connect to Microsoft Graph: $_"
        }
    }
}
