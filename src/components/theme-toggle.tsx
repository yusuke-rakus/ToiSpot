import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { useTheme, type Theme } from './theme-provider'

const options = [
  { value: 'light', label: 'ライト', icon: Sun },
  { value: 'dark', label: 'ダーク', icon: Moon },
  { value: 'system', label: 'システム', icon: Monitor },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const selected = options.find((option) => option.value === theme)!
  const Icon = selected.icon

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label={`テーマを変更（現在：${selected.label}）`}
          title={`テーマ：${selected.label}`}
        >
          <Icon className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          aria-label="テーマ"
          className="z-50 min-w-40 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <DropdownMenu.RadioGroup
            value={theme}
            onValueChange={(value) => setTheme(value as Theme)}
          >
            {options.map(({ value, label, icon: OptionIcon }) => (
              <DropdownMenu.RadioItem
                key={value}
                value={value}
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              >
                <OptionIcon className="size-4" aria-hidden="true" />
                {label}
                <DropdownMenu.ItemIndicator className="ml-auto">
                  <Check className="size-4" aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
