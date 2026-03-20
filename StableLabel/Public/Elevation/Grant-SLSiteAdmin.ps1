function Grant-SLSiteAdmin {
    <#
    .SYNOPSIS
        Grants site collection administrator rights to a user via Microsoft Graph API.
    .DESCRIPTION
        Uses the Graph API to add a user as a site collection administrator
        on a SharePoint site. The operation patches the site permissions
        to include the specified user principal name.
    .PARAMETER SiteUrl
        The URL of the SharePoint site collection.
    .PARAMETER UserPrincipalName
        The UPN of the user to grant site admin rights to.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Grant-SLSiteAdmin -SiteUrl 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'admin@contoso.com'
    .EXAMPLE
        Grant-SLSiteAdmin -SiteUrl 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'admin@contoso.com' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$SiteUrl,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$UserPrincipalName,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        # Graph connection is handled lazily by Invoke-SLGraphRequest
    }

    process {
        # Validate SharePoint URL format
        try {
            $siteUri = [System.Uri]$SiteUrl
        } catch {
            throw "Invalid URL format: '$SiteUrl'"
        }
        if ($siteUri.Scheme -ne 'https') {
            throw "Site URL must use HTTPS: '$SiteUrl'"
        }
        if ($siteUri.Host -notmatch '\.sharepoint\.(com|us|de|cn)$') {
            throw "Site URL must be a SharePoint site (*.sharepoint.com): '$SiteUrl'"
        }
        if ([string]::IsNullOrWhiteSpace($siteUri.AbsolutePath) -or $siteUri.AbsolutePath -eq '/') {
            throw "Site URL must include a path component: '$SiteUrl'"
        }

        $target = "site '$SiteUrl', user '$UserPrincipalName'"
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            SiteUrl           = $SiteUrl
            UserPrincipalName = $UserPrincipalName
            ElevationType     = [SLElevationType]::SiteAdmin
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Grant-SiteAdmin' -Target $target -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action            = 'Grant-SiteAdmin'
                SiteUrl           = $SiteUrl
                UserPrincipalName = $UserPrincipalName
                DryRun            = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($target, 'Grant site collection administrator')) {
            return
        }

        try {
            Write-Verbose "Granting site admin to '$UserPrincipalName' on '$SiteUrl'."

            # Parse the site URL to derive the Graph site identifier
            $siteUri = [System.Uri]$SiteUrl
            $hostname = $siteUri.Host
            $sitePath = $siteUri.AbsolutePath.TrimEnd('/')

            # Resolve the site ID via Graph
            $site = Invoke-SLGraphRequest -Method GET -Uri "/sites/${hostname}:${sitePath}"
            $siteId = $site.id

            # Look up the user to get their directory ID
            $encodedUpn = [System.Uri]::EscapeDataString($UserPrincipalName)
            $user = Invoke-SLGraphRequest -Method GET -Uri "/users/$encodedUpn"

            # Grant site collection admin via site permissions
            $body = @{
                roles              = @('owner')
                grantedToIdentities = @(
                    @{
                        application = $null
                        user        = @{
                            id          = $user.id
                            displayName = $user.displayName
                        }
                    }
                )
            }

            $result = Invoke-SLGraphRequest -Method POST `
                -Uri "/sites/$siteId/permissions" `
                -Body $body

            Write-SLAuditEntry -Action 'Grant-SiteAdmin' -Target $target -Detail $detail -Result 'success'

            $output = [PSCustomObject]@{
                Action            = 'Grant-SiteAdmin'
                SiteUrl           = $SiteUrl
                SiteId            = $siteId
                UserPrincipalName = $UserPrincipalName
                PermissionId      = $result.id
            }

            if ($AsJson) {
                return $output | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $output
        }
        catch {
            Write-SLAuditEntry -Action 'Grant-SiteAdmin' -Target $target -Detail $detail -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
