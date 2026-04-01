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
