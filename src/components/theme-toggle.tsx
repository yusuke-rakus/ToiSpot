import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from 'cn'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTheme, type Theme } from './theme-provider'

const options = [
  { value: 'light', label: 'ライト', icon: Sun },
  { value: 'dark', label: 'ダーク', icon: Moon },
  { value: 'system', label: 'システム', icon: Monitor },
] as const

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const selected = options.find((option) => option.value === theme)!
  const Icon = selected.icon

  return (
    <TooltipProvider delayDuration={300}>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-10', className)}
                aria-label={`テーマを変更（現在：${selected.label}）`}
              >
                <Icon className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">テーマ</TooltipContent>
        </Tooltip>

        <DropdownMenuContent
          align="end"
          sideOffset={8}
          aria-label="テーマ"
          className="min-w-40"
        >
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => setTheme(value as Theme)}
          >
            {options.map(({ value, label, icon: OptionIcon }) => (
              <DropdownMenuRadioItem
                key={value}
                value={value}
                className="min-h-10"
              >
                <OptionIcon className="size-4" aria-hidden="true" />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  )
}
