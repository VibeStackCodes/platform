'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z, type ZodTypeAny } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface DynamicFormProps {
  schema: z.ZodObject<any>;
  initialValues?: Record<string, any>;
  onSubmit: (data: any) => void;
  isLoading?: boolean;
  columnInfo?: Record<string, { data_type: string; is_nullable: boolean }>;
}

function getFieldType(schema: ZodTypeAny, columnInfo?: { data_type: string; is_nullable: boolean }): {
  type: 'text' | 'number' | 'boolean' | 'enum' | 'array';
  enumValues?: readonly string[];
} {
  const unwrapped = schema instanceof z.ZodOptional || schema instanceof z.ZodNullable
    ? schema.unwrap()
    : schema;

  if (columnInfo) {
    const dataType = columnInfo.data_type.toLowerCase();
    if (dataType === 'enum' && unwrapped instanceof z.ZodEnum) {
      return { type: 'enum', enumValues: unwrapped.options as readonly string[] };
    }
    if (dataType.includes('bool')) {
      return { type: 'boolean' };
    }
    if (dataType.includes('int') || dataType.includes('numeric')) {
      return { type: 'number' };
    }
    if (dataType.includes('array')) {
      return { type: 'array' };
    }
  }

  if (unwrapped instanceof z.ZodEnum) {
    return { type: 'enum', enumValues: unwrapped.options as readonly string[] };
  }
  if (unwrapped instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  if (unwrapped instanceof z.ZodNumber) {
    return { type: 'number' };
  }
  if (unwrapped instanceof z.ZodArray) {
    return { type: 'array' };
  }

  return { type: 'text' };
}

export function DynamicForm({
  schema,
  initialValues = {},
  onSubmit,
  isLoading = false,
  columnInfo = {},
}: DynamicFormProps) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
  });

  const fields = Object.keys(schema.shape);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {fields.map((fieldName) => {
          const fieldSchema = schema.shape[fieldName];
          const { type, enumValues } = getFieldType(fieldSchema, columnInfo[fieldName]);

          return (
            <FormField
              key={fieldName}
              control={form.control}
              name={fieldName}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="capitalize">{fieldName.replace(/_/g, ' ')}</FormLabel>
                  <FormControl>
                    {type === 'boolean' ? (
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          disabled={isLoading}
                        />
                        <span className="text-sm text-muted-foreground">
                          {field.value ? 'Yes' : 'No'}
                        </span>
                      </div>
                    ) : type === 'enum' && enumValues ? (
                      <Select
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                        disabled={isLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`Select ${fieldName}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {enumValues.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : type === 'array' ? (
                      <Input
                        {...field}
                        value={
                          Array.isArray(field.value)
                            ? JSON.stringify(field.value)
                            : field.value ?? ''
                        }
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            field.onChange(Array.isArray(parsed) ? parsed : []);
                          } catch {
                            field.onChange(e.target.value);
                          }
                        }}
                        placeholder="Enter JSON array"
                        disabled={isLoading}
                        className="font-mono text-sm"
                      />
                    ) : (
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        type={type}
                        disabled={isLoading}
                      />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          );
        })}
        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
