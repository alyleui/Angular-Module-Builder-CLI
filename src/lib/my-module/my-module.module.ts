import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MyModuleComponent } from './my-module.component';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [MyModuleComponent],
  exports: [MyModuleComponent]
})
export class MyModuleModule { }
