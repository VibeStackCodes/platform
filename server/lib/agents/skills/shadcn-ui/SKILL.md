---
name: shadcn-ui
description: shadcn/ui component patterns and composition with Radix UI primitives
version: 1.0.0
tags:
  - ui
  - components
  - radix
  - tailwind
  - react
---

# shadcn/ui Components

Instructions for using shadcn/ui components in generated Vite + React 19 apps. All shadcn/ui components are vendored in `src/components/ui/` and built on Radix UI primitives with Tailwind CSS styling.

## Component Architecture

shadcn/ui components are NOT installed via npm. They are copied into your project as source files that you own and can customize. All components are in `src/components/ui/`.

### Import Pattern

```typescript
// Always import from @/components/ui/<component-name>
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
```

## Core Components

### Button

```typescript
import { Button } from '@/components/ui/button'

function Example() {
  return (
    <>
      {/* Variants */}
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>

      {/* Sizes */}
      <Button size="default">Default</Button>
      <Button size="sm">Small</Button>
      <Button size="lg">Large</Button>
      <Button size="icon">
        <IconPlus className="h-4 w-4" />
      </Button>

      {/* States */}
      <Button disabled>Disabled</Button>
      <Button asChild>
        <Link to="/somewhere">Navigate</Link>
      </Button>
    </>
  )
}
```

### Card

```typescript
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

function PostCard({ post }: { post: Post }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{post.title}</CardTitle>
        <CardDescription>{post.author}</CardDescription>
      </CardHeader>
      <CardContent>
        <p>{post.excerpt}</p>
      </CardContent>
      <CardFooter>
        <Button>Read More</Button>
      </CardFooter>
    </Card>
  )
}
```

### Input & Label

```typescript
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function LoginForm() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          required
        />
      </div>
    </div>
  )
}
```

### Form (with react-hook-form)

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(10, 'Content must be at least 10 characters'),
})

type FormValues = z.infer<typeof formSchema>

function CreatePostForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      content: '',
    },
  })

  const onSubmit = (values: FormValues) => {
    console.log(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Enter title" {...field} />
              </FormControl>
              <FormDescription>
                The title of your post
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Content</FormLabel>
              <FormControl>
                <Input placeholder="Enter content" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Create Post</Button>
      </form>
    </Form>
  )
}
```

### Select

```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function StatusSelect() {
  return (
    <Select defaultValue="draft">
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="draft">Draft</SelectItem>
        <SelectItem value="published">Published</SelectItem>
        <SelectItem value="archived">Archived</SelectItem>
      </SelectContent>
    </Select>
  )
}

// With react-hook-form
<FormField
  control={form.control}
  name="status"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Status</FormLabel>
      <Select onValueChange={field.onChange} defaultValue={field.value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="Select a status" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="published">Published</SelectItem>
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )}
/>
```

### Dialog

```typescript
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

function DeletePostDialog({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the post.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onDelete()
              setOpen(false)
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Sheet (Side Panel)

```typescript
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

function UserProfile() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost">Open Profile</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>User Profile</SheetTitle>
          <SheetDescription>
            Update your profile information
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          {/* Profile form content */}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Side options
<SheetContent side="left">Left side</SheetContent>
<SheetContent side="right">Right side (default)</SheetContent>
<SheetContent side="top">Top</SheetContent>
<SheetContent side="bottom">Bottom</SheetContent>
```

### Table

```typescript
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function PostsTable({ posts }: { posts: Post[] }) {
  return (
    <Table>
      <TableCaption>A list of your recent posts</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {posts.map((post) => (
          <TableRow key={post.id}>
            <TableCell className="font-medium">{post.title}</TableCell>
            <TableCell>{post.status}</TableCell>
            <TableCell>{new Date(post.created_at).toLocaleDateString()}</TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm">Edit</Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

### Tabs

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function PostTabs() {
  return (
    <Tabs defaultValue="published">
      <TabsList>
        <TabsTrigger value="published">Published</TabsTrigger>
        <TabsTrigger value="draft">Drafts</TabsTrigger>
        <TabsTrigger value="archived">Archived</TabsTrigger>
      </TabsList>
      <TabsContent value="published">
        {/* Published posts list */}
      </TabsContent>
      <TabsContent value="draft">
        {/* Draft posts list */}
      </TabsContent>
      <TabsContent value="archived">
        {/* Archived posts list */}
      </TabsContent>
    </Tabs>
  )
}
```

### Dropdown Menu

```typescript
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">Menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Profile</DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red-600">
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### Toast (Sonner)

```typescript
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

function Example() {
  return (
    <>
      <Button onClick={() => toast('Event has been created')}>
        Show Toast
      </Button>

      <Button onClick={() => toast.success('Post published successfully')}>
        Success
      </Button>

      <Button onClick={() => toast.error('Failed to delete post')}>
        Error
      </Button>

      <Button
        onClick={() =>
          toast('Are you sure?', {
            action: {
              label: 'Confirm',
              onClick: () => console.log('Confirmed'),
            },
          })
        }
      >
        With Action
      </Button>
    </>
  )
}

// In your layout/root:
import { Toaster } from '@/components/ui/sonner'

function Layout() {
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
```

### Tooltip

```typescript
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'

function Example() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Hover me</Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Additional information</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

### Badge

```typescript
import { Badge } from '@/components/ui/badge'

function PostStatus({ status }: { status: string }) {
  return (
    <>
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>

      {/* Custom usage */}
      <Badge variant={status === 'published' ? 'default' : 'secondary'}>
        {status}
      </Badge>
    </>
  )
}
```

### Avatar

```typescript
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

function UserAvatar({ user }: { user: User }) {
  return (
    <Avatar>
      <AvatarImage src={user.avatar_url} alt={user.name} />
      <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}
```

### Skeleton

```typescript
import { Skeleton } from '@/components/ui/skeleton'

function PostSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-[250px]" />
      <Skeleton className="h-4 w-[200px]" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

// Loading state pattern
function PostsList() {
  const { data: posts, isLoading } = usePosts()

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
```

### Separator

```typescript
import { Separator } from '@/components/ui/separator'

function Example() {
  return (
    <div>
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Settings</h4>
        <p className="text-sm text-muted-foreground">
          Manage your account settings
        </p>
      </div>
      <Separator className="my-4" />
      <div className="space-y-4">
        {/* Settings content */}
      </div>
    </div>
  )
}
```

### Scroll Area

```typescript
import { ScrollArea } from '@/components/ui/scroll-area'

function CommentsList({ comments }: { comments: Comment[] }) {
  return (
    <ScrollArea className="h-72 w-full rounded-md border">
      <div className="p-4">
        {comments.map((comment) => (
          <div key={comment.id} className="mb-4">
            <p className="text-sm">{comment.content}</p>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
```

## Composition Patterns

### Complex Form

```typescript
function CreatePostForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Post</CardTitle>
        <CardDescription>Add a new post to your blog</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">Create</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
```

### Data Table with Actions

```typescript
function PostsTable({ posts }: { posts: Post[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Posts</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post) => (
              <TableRow key={post.id}>
                <TableCell>{post.title}</TableCell>
                <TableCell>
                  <Badge>{post.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">Actions</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem>Edit</DropdownMenuItem>
                      <DropdownMenuItem>Duplicate</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600">
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
```

## Available Components

Standard shadcn/ui components available in generated apps:

- Button
- Card (with Header, Footer, Title, Description, Content)
- Input
- Label
- Form (with Field, Item, Label, Control, Description, Message)
- Select (with Trigger, Value, Content, Item)
- Dialog (with Trigger, Content, Header, Title, Description, Footer)
- Sheet (with Trigger, Content, Header, Title, Description)
- Table (with Caption, Header, Body, Footer, Row, Head, Cell)
- Tabs (with List, Trigger, Content)
- DropdownMenu (with Trigger, Content, Item, Label, Separator)
- Tooltip (with Provider, Trigger, Content)
- Badge
- Avatar (with Image, Fallback)
- Skeleton
- Separator
- ScrollArea
- Toast/Sonner

## Common Pitfalls

1. **Missing `asChild` prop**: When wrapping components like `<Link>` inside `<Button>`, always use `asChild` to merge props correctly.

2. **Form field binding**: Always use `FormField` with `render` prop, not direct `Input` components, to get validation and error handling.

3. **Dialog/Sheet state**: Control dialog state with `open` and `onOpenChange` props for programmatic control.

4. **Select with forms**: Use `onValueChange={field.onChange}` for react-hook-form integration, not `onChange`.

5. **Tooltip provider**: Wrap tooltips with `TooltipProvider`, usually at the app root level.

6. **Table caption**: Always include `TableCaption` for accessibility, even if visually hidden.

7. **Custom styling**: Use `className` prop to extend styles, not inline `style` attribute.

8. **Import paths**: Always import from `@/components/ui/<component>`, never from `@radix-ui/*` directly.

9. **Toaster placement**: Add `<Toaster />` to your root layout once, not in every component.

10. **Form validation**: Use Zod schemas with `zodResolver` for type-safe form validation.
