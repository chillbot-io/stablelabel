function Get-SLLabel {
    <#
    .SYNOPSIS
        Gets sensitivity labels from Microsoft Graph API.
    .DESCRIPTION
        Retrieves sensitivity labels via the Graph beta endpoint
        /security/informationProtection/sensitivityLabels. Supports
        fetching all labels, a single label by ID, or searching by name.
        The -Tree switch displays labels in a parent/sublabel hierarchy.
    .PARAMETER Id
        The GUID of a specific sensitivity label to retrieve.
    .PARAMETER Name
        A label display name to search for (exact match).
    .PARAMETER Tree
        Display labels in a parent/sublabel hierarchy.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLLabel
    .EXAMPLE
        Get-SLLabel -Id '00000000-0000-0000-0000-000000000001'
    .EXAMPLE
        Get-SLLabel -Name 'Confidential'
    .EXAMPLE
        Get-SLLabel -Tree
    #>
    [CmdletBinding(DefaultParameterSetName = 'All')]
    param(
        [Parameter(ParameterSetName = 'ById', ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Id,

        [Parameter(ParameterSetName = 'ByName')]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [Parameter(ParameterSetName = 'All')]
        [switch]$Tree,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Graph
    }

    process {
        try {
            switch ($PSCmdlet.ParameterSetName) {
                'ById' {
                    Write-Verbose "Retrieving sensitivity label with ID: $Id"
                    $result = Invoke-SLGraphRequest -Method GET `
                        -Uri "/security/informationProtection/sensitivityLabels/$Id" `
                        -ApiVersion beta
                }
                'ByName' {
                    Write-Verbose "Searching for sensitivity label with name: $Name"
                    $allLabels = Invoke-SLGraphRequest -Method GET `
                        -Uri '/security/informationProtection/sensitivityLabels' `
                        -ApiVersion beta -AutoPaginate

                    $result = $allLabels | Where-Object {
                        $_.name -eq $Name -or $_.displayName -eq $Name
                    }

                    if (-not $result) {
                        Write-Warning "No sensitivity label found with name '$Name'."
                        return
                    }
                }
                'All' {
                    Write-Verbose 'Retrieving all sensitivity labels.'
                    $allLabels = Invoke-SLGraphRequest -Method GET `
                        -Uri '/security/informationProtection/sensitivityLabels' `
                        -ApiVersion beta -AutoPaginate

                    if ($Tree) {
                        $result = Build-SLLabelTree -Labels $allLabels
                    }
                    else {
                        $result = $allLabels
                    }
                }
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}

function Build-SLLabelTree {
    <#
    .SYNOPSIS
        Builds a parent/sublabel hierarchy from a flat list of labels.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object[]]$Labels
    )

    # Identify parent labels (those without a parent property or with empty parent)
    $parentLabels = $Labels | Where-Object {
        -not $_.parent -and -not $_.parentLabelId
    }

    $tree = foreach ($parent in ($parentLabels | Sort-Object { $_.displayName ?? $_.name })) {
        $children = $Labels | Where-Object {
            $_.parent.id -eq $parent.id -or $_.parentLabelId -eq $parent.id
        } | Sort-Object { $_.displayName ?? $_.name }

        [PSCustomObject]@{
            Id          = $parent.id
            Name        = $parent.displayName ?? $parent.name
            Tooltip     = $parent.tooltip
            IsActive    = $parent.isActive
            SubLabels   = @(
                foreach ($child in $children) {
                    [PSCustomObject]@{
                        Id       = $child.id
                        Name     = $child.displayName ?? $child.name
                        Tooltip  = $child.tooltip
                        IsActive = $child.isActive
                    }
                }
            )
        }
    }

    return $tree
}
