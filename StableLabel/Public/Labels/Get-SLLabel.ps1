function Get-SLLabel {
    <#
    .SYNOPSIS
        Gets sensitivity labels from the Security & Compliance Center.
    .DESCRIPTION
        Retrieves sensitivity labels via the Compliance Center Get-Label cmdlet
        instead of the Graph API, avoiding Graph connection overhead. Supports
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
        Assert-SLConnected -Require Compliance
    }

    process {
        try {
            switch ($PSCmdlet.ParameterSetName) {
                'ById' {
                    Write-Verbose "Retrieving sensitivity label with ID: $Id"
                    $result = Invoke-SLComplianceCommand -OperationName "Get-Label -Identity $Id" -ScriptBlock {
                        Get-Label -Identity $Id -ErrorAction Stop
                    }.GetNewClosure()

                    if ($result) {
                        $result = Convert-SLComplianceLabel -Label $result
                    }
                }
                'ByName' {
                    Write-Verbose "Searching for sensitivity label with name: $Name"
                    $allLabels = Invoke-SLComplianceCommand -OperationName 'Get-Label (all)' -ScriptBlock {
                        Get-Label -ErrorAction Stop
                    }
                    $allLabels = @($allLabels | ForEach-Object { Convert-SLComplianceLabel -Label $_ })

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
                    $allLabels = Invoke-SLComplianceCommand -OperationName 'Get-Label (all)' -ScriptBlock {
                        Get-Label -ErrorAction Stop
                    }
                    $allLabels = @($allLabels | ForEach-Object { Convert-SLComplianceLabel -Label $_ })

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

function Convert-SLComplianceLabel {
    <#
    .SYNOPSIS
        Converts a Compliance Center label object to the normalized format
        previously returned by the Graph API, ensuring downstream compatibility.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object]$Label
    )

    [PSCustomObject]@{
        id            = $Label.Guid.ToString()
        name          = $Label.Name
        displayName   = $Label.DisplayName
        tooltip       = $Label.Tooltip
        isActive      = ($Label.Mode -eq 'Enforce')
        parentLabelId = if ($Label.ParentId -and $Label.ParentId -ne [guid]::Empty) {
                            $Label.ParentId.ToString()
                        } else { $null }
        parent        = $null
        priority      = $Label.Priority
        description   = $Label.Comment
        contentType   = $Label.ContentType
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
