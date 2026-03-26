function Get-SLSiteList {
    <#
    .SYNOPSIS
        Lists SharePoint sites accessible to the current user via Microsoft Graph.
    .DESCRIPTION
        Enumerates SharePoint sites using the Graph API search endpoint.
        Returns site display name, URL, and ID for use in the Explorer.
    .PARAMETER Search
        Optional search term to filter sites by name.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLSiteList
    .EXAMPLE
        Get-SLSiteList -Search 'HR'
    #>
    [CmdletBinding()]
    param(
        [string]$Search = '*',

        [switch]$AsJson
    )

    process {
        try {
            Write-Verbose "Searching for SharePoint sites matching '$Search'..."

            $uri = "/sites?search=$Search&`$select=id,displayName,webUrl,name,createdDateTime&`$top=100"
            $result = Invoke-SLGraphRequest -Method GET -Uri $uri -AutoPaginate

            $sites = @()
            $items = if ($result -is [array]) { $result } elseif ($result.value) { $result.value } else { @($result) }

            foreach ($site in $items) {
                $sites += [PSCustomObject]@{
                    Id              = $site.id
                    DisplayName     = $site.displayName
                    Name            = $site.name
                    WebUrl          = $site.webUrl
                    CreatedDateTime = $site.createdDateTime
                }
            }

            $output = [PSCustomObject]@{
                Action = 'Get-SiteList'
                Count  = $sites.Count
                Sites  = @($sites)
            }

            if ($AsJson) {
                return $output | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            $output
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
