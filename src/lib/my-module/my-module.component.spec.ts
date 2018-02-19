import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { MyModuleComponent } from './my-module.component';

describe('MyModuleComponent', () => {
  let component: MyModuleComponent;
  let fixture: ComponentFixture<MyModuleComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MyModuleComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MyModuleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
