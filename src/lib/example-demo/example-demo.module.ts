import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExampleDemoComponent } from './example-demo.component';
import { MyModuleModule } from 'my-module';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [ExampleDemoComponent]
})
export class ExampleDemoModule { }
